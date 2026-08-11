param(
    [Parameter(Mandatory = $true)]
    [string]$CredentialPath
)

$ErrorActionPreference = 'Stop'
$record = Get-Content -LiteralPath $CredentialPath -Raw -Encoding UTF8 | ConvertFrom-Json
$securePassword = ConvertTo-SecureString -String $record.protectedPassword
$passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)

try {
    $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
    $result = [ordered]@{
        username = [string]$record.username
        password = $plainPassword
    }
    [Console]::Out.Write(($result | ConvertTo-Json -Compress))
}
finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
    $plainPassword = $null
}

