/**
 * @file adm-zip 模块类型声明
 * @description adm-zip 官方未提供 .d.ts，补充一个最小子集的类型声明供 main 进程使用。
 * @module shared/types
 */
declare module 'adm-zip' {
  interface AdmZipEntry {
    getData(): Buffer
    isDirectory: boolean
    entryName: string
  }
  class AdmZip {
    constructor(filePath?: string)
    addLocalFolder(folderPath: string, zipPath?: string): void
    addLocalFile(filePath: string, zipPath?: string): void
    extractAllTo(targetPath: string, overwrite?: boolean): void
    extractEntryTo(entryName: string, targetPath: string, overwrite?: boolean): void
    getEntry(name: string): AdmZipEntry | null
    getEntries(): AdmZipEntry[]
    writeZip(targetPath: string): void
  }
  export default AdmZip
}
