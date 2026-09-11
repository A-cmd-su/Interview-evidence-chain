$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class EvidenceCredential {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public struct Credential { public uint Flags; public uint Type; public string TargetName; public string Comment; public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten; public uint CredentialBlobSize; public IntPtr CredentialBlob; public uint Persist; public uint AttributeCount; public IntPtr Attributes; public string TargetAlias; public string UserName; }
  [DllImport("advapi32.dll", EntryPoint="CredWriteW", CharSet=CharSet.Unicode, SetLastError=true)] public static extern bool Write(ref Credential c, uint flags);
  [DllImport("advapi32.dll", EntryPoint="CredReadW", CharSet=CharSet.Unicode, SetLastError=true)] public static extern bool Read(string name, uint type, uint flags, out IntPtr ptr);
  [DllImport("advapi32.dll", EntryPoint="CredDeleteW", CharSet=CharSet.Unicode, SetLastError=true)] public static extern bool Delete(string name, uint type, uint flags);
  [DllImport("advapi32.dll")] public static extern void CredFree(IntPtr ptr);
}
'@
$request = [Console]::In.ReadToEnd() | ConvertFrom-Json
$target = 'InterviewEvidence/' + $request.id
switch ($request.action) {
  'set' {
    $c = New-Object EvidenceCredential+Credential
    $c.Type = 1; $c.TargetName = $target; $c.UserName = 'local-user'; $c.Persist = 2
    $c.CredentialBlob = [Runtime.InteropServices.Marshal]::StringToCoTaskMemUni($request.secret)
    $c.CredentialBlobSize = [Text.Encoding]::Unicode.GetByteCount($request.secret)
    try { if (-not [EvidenceCredential]::Write([ref]$c, 0)) { throw 'Credential write failed' } } finally { [Runtime.InteropServices.Marshal]::ZeroFreeCoTaskMemUnicode($c.CredentialBlob) }
    [Console]::Write('{}')
  }
  'get' {
    $ptr = [IntPtr]::Zero
    if (-not [EvidenceCredential]::Read($target, 1, 0, [ref]$ptr)) { [Console]::Write('{"secret":null}'); break }
    try { $c = [Runtime.InteropServices.Marshal]::PtrToStructure($ptr, [type][EvidenceCredential+Credential]); $secret = [Runtime.InteropServices.Marshal]::PtrToStringUni($c.CredentialBlob, $c.CredentialBlobSize / 2); [Console]::Write((@{secret=$secret} | ConvertTo-Json -Compress)) } finally { [EvidenceCredential]::CredFree($ptr) }
  }
  'delete' { [void][EvidenceCredential]::Delete($target, 1, 0); [Console]::Write('{}') }
}
