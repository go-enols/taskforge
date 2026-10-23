package top.likecloud.taskforge;

import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * TaskForge APK 更新插件。
 *
 * - getVersion(): 返回当前安装包的 versionCode/versionName
 * - downloadAndInstall({url, sha256, fileName}): 后台下载 APK → 校验 SHA-256 →
 *   通过 FileProvider + ACTION_VIEW 调起系统安装器
 * - 事件 downloadProgress: {percent, downloaded, total}
 *
 * 说明：Android 不允许应用静默安装 APK，必须由系统安装器确认；
 * 首次更新需要在系统设置中允许本应用「安装未知应用」。
 */
@CapacitorPlugin(name = "AppUpdater")
public class AppUpdaterPlugin extends Plugin {

    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    @PluginMethod
    public void getVersion(PluginCall call) {
        try {
            Context context = getContext();
            PackageManager packageManager = context.getPackageManager();
            PackageInfo info;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                info = packageManager.getPackageInfo(context.getPackageName(), PackageManager.PackageInfoFlags.of(0));
            } else {
                info = packageManager.getPackageInfo(context.getPackageName(), 0);
            }
            long versionCode = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
                    ? info.getLongVersionCode()
                    : info.versionCode;
            JSObject result = new JSObject();
            result.put("versionCode", versionCode);
            result.put("versionName", info.versionName);
            result.put("packageName", context.getPackageName());
            call.resolve(result);
        } catch (Exception exception) {
            call.reject("无法读取版本信息: " + exception.getMessage());
        }
    }

    @PluginMethod
    public void downloadAndInstall(final PluginCall call) {
        final String url = call.getString("url");
        final String sha256 = call.getString("sha256");
        final String fileName = call.getString("fileName", "TaskForge-update.apk");
        if (url == null || url.isEmpty()) {
            call.reject("缺少安装包下载地址");
            return;
        }

        final Context context = getContext();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                && !context.getPackageManager().canRequestPackageInstalls()) {
            try {
                Intent intent = new Intent(
                        Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                        Uri.parse("package:" + context.getPackageName())
                );
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(intent);
            } catch (Exception ignored) {
                /* 部分 ROM 没有该设置页 */
            }
            call.reject("请先在系统设置中允许本应用安装未知来源应用，然后重试", "NEED_INSTALL_PERMISSION");
            return;
        }

        executor.execute(() -> {
            File apkFile = null;
            HttpURLConnection connection = null;
            try {
                File dir = new File(context.getCacheDir(), "updates");
                if (!dir.exists() && !dir.mkdirs()) {
                    throw new Exception("无法创建下载目录");
                }
                apkFile = new File(dir, fileName.replaceAll("[^A-Za-z0-9._-]", "_"));
                if (apkFile.exists() && !apkFile.delete()) {
                    throw new Exception("无法清理旧安装包");
                }

                connection = (HttpURLConnection) new URL(url).openConnection();
                connection.setConnectTimeout(20000);
                connection.setReadTimeout(60000);
                connection.setInstanceFollowRedirects(true);
                connection.connect();
                int status = connection.getResponseCode();
                if (status < 200 || status >= 300) {
                    throw new Exception("下载失败（HTTP " + status + "）");
                }

                int total = connection.getContentLength();
                MessageDigest digest = MessageDigest.getInstance("SHA-256");
                try (InputStream input = new BufferedInputStream(connection.getInputStream());
                     FileOutputStream output = new FileOutputStream(apkFile)) {
                    byte[] buffer = new byte[64 * 1024];
                    long downloaded = 0;
                    int lastPercent = -1;
                    int read;
                    while ((read = input.read(buffer)) != -1) {
                        output.write(buffer, 0, read);
                        digest.update(buffer, 0, read);
                        downloaded += read;
                        if (total > 0) {
                            int percent = (int) ((downloaded * 100) / total);
                            if (percent != lastPercent) {
                                lastPercent = percent;
                                notifyProgress(percent, downloaded, total);
                            }
                        }
                    }
                }

                if (total > 0 && apkFile.length() != total) {
                    throw new Exception("安装包下载不完整，请重试");
                }
                if (sha256 != null && !sha256.isEmpty()) {
                    StringBuilder actual = new StringBuilder();
                    for (byte value : digest.digest()) {
                        actual.append(String.format("%02x", value));
                    }
                    if (!actual.toString().equalsIgnoreCase(sha256)) {
                        apkFile.delete();
                        throw new Exception("安装包校验失败，请重试");
                    }
                }

                installApk(context, apkFile);
                resolveOnUi(call, null);
            } catch (Exception exception) {
                if (apkFile != null && apkFile.exists()) {
                    apkFile.delete();
                }
                rejectOnUi(call, exception.getMessage() == null ? "更新失败" : exception.getMessage());
            } finally {
                if (connection != null) connection.disconnect();
            }
        });
    }

    private void notifyProgress(int percent, long downloaded, long total) {
        JSObject data = new JSObject();
        data.put("percent", percent);
        data.put("downloaded", downloaded);
        data.put("total", total);
        getActivity().runOnUiThread(() -> notifyListeners("downloadProgress", data));
    }

    private void installApk(Context context, File apkFile) {
        Uri apkUri = FileProvider.getUriForFile(
                context,
                context.getPackageName() + ".fileprovider",
                apkFile
        );
        Intent intent = new Intent(Intent.ACTION_VIEW);
        intent.setDataAndType(apkUri, "application/vnd.android.package-archive");
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        context.startActivity(intent);
    }

    private void resolveOnUi(PluginCall call, JSObject result) {
        getActivity().runOnUiThread(() -> call.resolve(result));
    }

    private void rejectOnUi(PluginCall call, String message) {
        getActivity().runOnUiThread(() -> call.reject(message));
    }
}
