# 单用户交付与维护

## 备份

数据库默认 `data/evidence.sqlite`，可用 `DATA_DIR`指定目录。日常从“历史与设置”导出JSON备份，导入前先保存当前副本。服务端先校验哈希和结构，失败不修改现有数据。

复制数据库原文件前先停止API，再复制整个数据目录；运行中不要只复制 `.sqlite`而漏掉WAL。Windows长期Key保存在凭据管理器 `InterviewEvidence/<配置ID>`，不会随备份导出，换机器须重新填写。

清空资料删除草稿、报告、任务和用量；模型档案单独删除，同时删除其系统凭据。外部备份不受应用清理控制。SQLite删除不是磁盘安全擦除。

## 升级

已提供自动化发布准备与回滚命令，见下文。手动操作仍可按以下步骤执行。

1. 等待或取消模型任务，导出备份。取消不保证退款。
2. 停止API和前端，备份整个数据目录。
3. 更新代码，执行 `npm ci`、`npm test`、`npm run build`。
4. 使用相同数据目录及端口启动，核对历史、档案和新请求。
5. 回退前停止服务，同时恢复匹配的代码和数据副本，不把新数据库交给未知旧版本。

数据库 `user_version=1`，工作区版本2，当前报告版本 `evidence-loop-3.0`。旧报告原样保留，不补造复核和确认状态。

## 恢复与并发

请求ID先保存再提交。刷新查询原任务；若页面在保存ID后、POST到达前关闭，查询可提示ID不存在，归档后再提交。API重启把未完成任务标记中断，不自动重发。上游可能已产生费用。

多页面修订冲突时停止覆盖并提示刷新。备份及工作区上限25MB；用量显示最近2000条，任务列表显示近期记录。未保存修改时离开页面会提示。

## 真实供应商验收

保存实际账户配置，在模型设置展开完整验收并确认费用。依次执行连接、JD提取、出题、评分复核、追问回答和长文本；记录具体地址、模型、协议和时间。失败不会沿用旧通过状态。

本轮开发没有实际账户Key；兼容测试端点不能证明供应商可用、余额正常或评分准确。真实验收入口已实现，实际账户运行留待用户配置。通过后仍需人工核查引用与评分的语义关系，同模型复核可能共享偏差。

## OCR和语音

OCR核心与工作线程随应用构建，首次识别需要从CDN下载中英文语言包；下载失败或超时会明确报错，不生成替代经历。已验证合成图片的实际识别；文档质量与布局仍影响结果，真实扫描件必须校对。

语音需要麦克风权限；Web Speech服务依赖浏览器与地区。页面先告知音频接收方再启动，确认文字后才评分。不支持转写时允许录音回听并手工校对。自动化测试不代表麦克风、口音与语音服务验收。

## 部署边界

当前支持本机或个人远程使用。生产模式同进程提供前端和API，默认绑定loopback；远程需个人密码、PUBLIC_ORIGIN 和 HTTPS 反向代理。完整步骤见 [部署说明](DEPLOYMENT.md)。密码文件仅保存加盐摘要；数据库和个人资料应由操作系统权限保护。

已提供单人登录、登录尝试限流、Secure Cookie、CSP和数据接口访问控制。多人托管仍需要每用户独立所有权、跨用户授权测试、出站DNS/IP限制及重绑定防护。本次不包含多人账号或招聘方后台。

## 加密完整备份与异地保存

完整备份使用 SQLite 一致性快照，包含所有工作区、资料库、任务、模型档案、费率、用量和访问密码哈希。先检查数据库和证据结构，再用 scrypt 派生密钥及 AES-256-GCM 加密。系统凭据中的API Key、页面音视频、外部快照、源代码和TLS私钥不包含在内。备份口令丢失后不能解密，请单独保管。

一次性备份、校验与恢复（PowerShell）：

```powershell
$backupSecret = Read-Host "独立备份口令（至少12字符）" -AsSecureString
$env:EVIDENCE_BACKUP_PASSPHRASE = [Net.NetworkCredential]::new('', $backupSecret).Password
npm run backup -- create --data-dir D:\O-1\data --output D:\O-1-backups\personal.iecbackup
npm run backup -- verify --file D:\O-1-backups\personal.iecbackup
npm run backup -- restore --file D:\O-1-backups\personal.iecbackup --target D:\O-1-restored-data
Remove-Item Env:EVIDENCE_BACKUP_PASSPHRASE
```

恢复只写入空目录，拒绝覆盖已有数据；错误口令、篡改、数据库损坏或证据位置不匹配会中止恢复。完整加密文件上限300MB。恢复后以该目录作为`DATA_DIR`，先在新端口检查历史和设置，再切换原服务。更换机器后重新输入Key；档案里“已保存凭据”标记不代表新机器上已经存在该凭据。

如需每天自动备份，在服务的受保护环境中设置`FULL_BACKUP_DIR`和`EVIDENCE_BACKUP_PASSPHRASE`。运行中每分钟检查，达到一天间隔后生成完整快照并执行解密与数据库复验，默认保留30份；只轮转本服务命名的快照。“历史与设置 → 加密完整备份”显示最近状态并可立即执行。不要把口令提交到仓库。

`FULL_BACKUP_DIR`可指向挂载的NAS、独立磁盘或异地持久卷；挂载和访问凭据由操作系统管理。目录在同一台机器上不等于异地容灾。目标不可写时界面显示失败，原数据库保留。需要启动后立即验收时点击“立即生成加密完整备份”，不要只检查目录是否存在。

## 发布准备与回滚命令

工具要求Node、Git、tar和npm。先提交当前代码，工作区须干净；停止新增资料写入并等待所有模型任务结束。准备过程不切换运行服务，但数据副本只包含快照时刻，之后继续写入的记录不会自动复制到发布目录。

```powershell
# 先按上节设置独立备份口令，再获取并审核目标提交
git fetch origin
npm run release -- stage --ref origin/main --destination D:\O-1-releases\release-20260913 --data-dir D:\O-1\data
```

工具在新目录保存升级前的代码归档、完整加密备份，解出目标代码，执行`npm ci`和`npm run build`，恢复独立数据副本，写出`release.json`。构建或校验失败时不会生成“staged”成功清单，也不会切换原应用。目标目录须不存在，且必须位于当前项目之外。

使用清单里的`app`、`data`路径和一个新端口启动验收版本，通过后再修改系统服务/容器部署配置并停止旧实例。不要让新旧版本同时写同一个SQLite文件。容器镜像的升级仍使用Docker重新构建并保留数据卷；发布目录脚本运行在有Git和npm的宿主机上。

```powershell
npm run release -- rollback --manifest D:\O-1-releases\release-20260913\release.json --destination D:\O-1-releases\rollback-20260913
```

回滚命令将升级前代码和当时的数据恢复到另一新目录并重新构建。先验收，再切换服务；原新版本目录和升级后的新记录仍保留，不自动合并进旧数据库。不要直接把新数据库交给未知旧代码。

## 启动诊断

```powershell
npm run diagnose
npm run diagnose -- --url http://127.0.0.1:8787
npm run diagnose -- --docker
```

检查Node版本、构建文件、目录可写、SQLite完整性及远程密码/HTTPS配置；可检查运行服务和Docker引擎。诊断输出不包含Key、简历、密码或备份口令。模型连通性、真实评分和实体设备仍通过应用中的实际验收流程检查。
