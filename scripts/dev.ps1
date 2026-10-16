# Arranca los servidores de desarrollo en segundo plano y espera a que respondan
# sondeando el puerto, en vez de con un Start-Sleep fijo largo.
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

function Stop-Dev {
  Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
    Where-Object { $_.CommandLine -match 'chink-saas' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
}

function Wait-Port($port, $timeoutSec = 25) {
  $deadline = (Get-Date).AddSeconds($timeoutSec)
  while ((Get-Date) -lt $deadline) {
    if (Test-Port $port) { return $true }
    Start-Sleep -Milliseconds 400
  }
  return $false
}

# Puerto TCP abierto en local (sin necesitar permisos de admin).
function Test-Port($port) {
  $client = New-Object Net.Sockets.TcpClient
  try {
    $result = $client.BeginConnect("127.0.0.1", $port, $null, $null)
    return $result.AsyncWaitHandle.WaitOne(800)
  } catch {
    return $false
  } finally {
    $client.Close()
  }
}

# Túnel SSH al SMTP del VPS (solo si no hay nada escuchando ya).
function Start-SmtpTunnel {
  if (Test-Port 2525) { return $true }
  Start-Process ssh -ArgumentList @("-o", "BatchMode=yes", "-o", "ConnectTimeout=10", "-N", "-L", "2525:172.17.0.1:587", "trell-vps") -NoNewWindow
  $deadline = (Get-Date).AddSeconds(15)
  while ((Get-Date) -lt $deadline) {
    if (Test-Port 2525) { return $true }
    Start-Sleep -Milliseconds 400
  }
  return $false
}

function Start-Dev {
  param([switch]$Fresh)
  if ($Fresh) { Stop-Dev; Start-Sleep -Seconds 1 }

  $smtp = Start-SmtpTunnel

  if (-not (Test-Port 3100)) {
    Start-Process pnpm.cmd -ArgumentList '--filter', '@chink-saas/api', 'dev' -WorkingDirectory $root `
      -RedirectStandardOutput "$root/api.log" -RedirectStandardError "$root/api.err" -NoNewWindow
  }
  if (-not (Test-Port 5173)) {
    Start-Process pnpm.cmd -ArgumentList '--filter', '@chink-saas/web', 'dev' -WorkingDirectory $root `
      -RedirectStandardOutput "$root/web.log" -RedirectStandardError "$root/web.err" -NoNewWindow
  }

  $api = Wait-Port 3100
  $web = Wait-Port 5173
  [pscustomobject]@{ Api = $api; Web = $web; Smtp = $smtp }
}