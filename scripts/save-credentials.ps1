param(
    [Parameter(Mandatory = $true)]
    [string]$UserName
)

$ErrorActionPreference = 'Stop'
$workspacePath = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$runtimePath = Join-Path $workspacePath '.runtime'
$credentialPath = Join-Path $runtimePath 'rithum-credentials.json'

New-Item -ItemType Directory -Path $runtimePath -Force | Out-Null
$securePassword = Read-Host 'Rithum password' -AsSecureString
$protectedPassword = ConvertFrom-SecureString -SecureString $securePassword

$record = [ordered]@{
    username = $UserName
    protectedPassword = $protectedPassword
    protectedFor = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
    createdAt = [DateTime]::UtcNow.ToString('o')
}

$record | ConvertTo-Json | Set-Content -LiteralPath $credentialPath -Encoding UTF8
Write-Output 'Encrypted credentials saved for the current Windows user.'

