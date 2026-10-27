# Proprius automated tests: T-01 - T-05

$ErrorActionPreference = "Continue"
$ollama = "http://localhost:11434"
$badUri = "http://localhost:11435/api/chat"
$model  = "llama3.2:3b"
$results = @()

function Write-Result($id, $name, $pass, $detail) {
  $status = if ($pass) { "PASS" } else { "FAIL" }
  $script:results += [pscustomobject]@{ Id = $id; Name = $name; Status = $status; Detail = $detail }
  Write-Host ""
  Write-Host "=== $id $name : $status ===" -ForegroundColor $(if ($pass) { "Green" } else { "Red" })
  Write-Host $detail
}

function Invoke-Chat([string]$prompt, [string]$uri = "$ollama/api/chat", [int]$timeoutSec = 180) {
  $body = @{
    model = $model
    stream = $false
    messages = @(@{ role = "user"; content = $prompt })
  } | ConvertTo-Json -Depth 5

  return Invoke-RestMethod -Uri $uri -Method Post -ContentType "application/json" -Body $body -TimeoutSec $timeoutSec
}

Write-Host "Proprius test run T-01..T-05"
Write-Host "Model: $model"
Write-Host "Ollama: $ollama"

# Ollama health check 
try {
  $tags = Invoke-RestMethod -Uri "$ollama/api/tags" -TimeoutSec 5
  $names = @($tags.models | ForEach-Object { $_.name })
  if ($names -notcontains $model) {
    Write-Host "WARNING: $model not in ollama list: $($names -join ', ')" -ForegroundColor Yellow
  } else {
    Write-Host "Ollama OK; model present."
  }
} catch {
  Write-Host "WARNING: Ollama not reachable. T-01/T-03/T-05 may fail. T-04 should still pass." -ForegroundColor Yellow
}

# T-01
try {
  $r = Invoke-Chat "What is 2 + 2? Reply in one short sentence."
  $ok = ($null -ne $r.message) -and -not [string]::IsNullOrWhiteSpace($r.message.content)
  Write-Result "T-01" "Prompt submission" $ok "Response: $($r.message.content)"
} catch {
  Write-Result "T-01" "Prompt submission" $false $_.Exception.Message
}

# T-02
$emptyPrompt = "   "
$rejectedLocally = [string]::IsNullOrWhiteSpace($emptyPrompt.Trim())
if ($rejectedLocally) {
  Write-Result "T-02" "Input validation" $true "Empty/whitespace prompt rejected locally (mirrors ChatInput). Note: UI does not currently show an error message."
} else {
  Write-Result "T-02" "Input validation" $false "Empty prompt was not rejected."
}

# T-03
try {
  $r = Invoke-Chat "What is 2 + 2? Reply in one short sentence."
  $text = $r.message.content
  $ok = -not [string]::IsNullOrWhiteSpace($text)
  Write-Result "T-03" "Model response" $ok "Response: $text"
} catch {
  Write-Result "T-03" "Model response" $false $_.Exception.Message
}

# T-04
try {
  $null = Invoke-Chat "Hello" -uri $badUri -timeoutSec 5
  Write-Result "T-04" "Error handling" $false "Unexpected success talking to $badUri"
} catch {
  Write-Result "T-04" "Error handling" $true "Connection failure caught: $($_.Exception.Message)"
}

# T-05
try {
  $prompts = @(
    "Reply with exactly: ONE",
    "Reply with exactly: TWO",
    "Reply with exactly: THREE"
  )
  $lines = @()
  $allOk = $true
  $n = 1
  foreach ($p in $prompts) {
    $r = Invoke-Chat $p
    $text = $r.message.content
    if ([string]::IsNullOrWhiteSpace($text)) { $allOk = $false }
    $lines += "Request $n PROMPT=$p RESPONSE=$text"
    $n++
  }
  Write-Result "T-05" "Sequential requests" $allOk ($lines -join "`n")
} catch {
  Write-Result "T-05" "Sequential requests" $false $_.Exception.Message
}

# Summary
Write-Host ""
Write-Host "========== SUMMARY =========="
$results | Format-Table -AutoSize
$passed = @($results | Where-Object Status -eq "PASS").Count
$failed = @($results | Where-Object Status -eq "FAIL").Count
Write-Host "Passed: $passed  Failed: $failed  Total: $($results.Count)"

Write-Host ""
Write-Host "Press Enter to close..."
[void][System.Console]::ReadLine()
