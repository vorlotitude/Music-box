# Reads the GitHub PAT stored in Windows Credential Manager for github.com
# and prints it to stdout (capture with $env:GMB_TOKEN = (.\readtoken.ps1)).
$cs = @'
using System;
using System.Runtime.InteropServices;
public static class Cred2 {
  [StructLayout(LayoutKind.Sequential)]
  struct CREDENTIAL {
    public int Flags, Type;
    public IntPtr TargetName, Comment;
    public long LastWritten;
    public int CredentialBlobSize;
    public IntPtr CredentialBlob;
    public int Persist, AttributeCount;
    public IntPtr Attributes, TargetAlias, UserName;
  }
  [DllImport("advapi32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  public static extern bool CredRead(string target, int type, int flag, out IntPtr pcred);
  [DllImport("advapi32.dll")]
  public static extern void CredFree(IntPtr buffer);
  public static string Read(string target) {
    IntPtr p;
    if(!CredRead(target, 1, 0, out p)) return null;
    try {
      var c = (CREDENTIAL)Marshal.PtrToStructure(p, typeof(CREDENTIAL));
      if(c.CredentialBlob != IntPtr.Zero && c.CredentialBlobSize>0)
        return Marshal.PtrToStringUni(c.CredentialBlob, c.CredentialBlobSize/2);
      return null;
    } finally { CredFree(p); }
  }
}
'@
Add-Type -TypeDefinition $cs
[Cred2]::Read("git:https://github.com")