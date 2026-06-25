$fontpath = "c:\Users\Work\Desktop\misc coding\whitelabel_librechat\provisioner\assets\pjs-800.ttf"
$outpath = "c:\Users\Work\Desktop\misc coding\whitelabel_librechat\provisioner\assets\pjs-800.b64"
$bytes = [System.IO.File]::ReadAllBytes($fontpath)
$b64 = [System.Convert]::ToBase64String($bytes)
Write-Host "Base64 length: $($b64.Length)"
[System.IO.File]::WriteAllText($outpath, $b64)
Write-Host "Saved to $outpath"
