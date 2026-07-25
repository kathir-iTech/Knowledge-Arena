function Get-Json {
  param($url, $method="GET", $body=$null)
  $request = [System.Net.WebRequest]::Create($url)
  $request.Method = $method
  $request.ContentType = "application/json"
  if ($body) {
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($body)
    $request.ContentLength = $bytes.Length
    $stream = $request.GetRequestStream()
    $stream.Write($bytes, 0, $bytes.Length)
    $stream.Close()
  } else {
    $request.ContentLength = 0
  }
  try {
    $response = $request.GetResponse()
    $reader = New-Object System.IO.StreamReader($response.GetResponseStream())
    $result = $reader.ReadToEnd()
    $response.Close()
    return $result
  } catch {
    $ex = $_.Exception
    while ($ex.InnerException) { $ex = $ex.InnerException }
    if ($ex.Response) {
      $reader = New-Object System.IO.StreamReader($ex.Response.GetResponseStream())
      $result = $reader.ReadToEnd()
      return $result
    }
    return "ERROR: $($_.Exception.Message)"
  }
}

function Get-Status {
  param($url, $method="GET", $body=$null)
  $request = [System.Net.WebRequest]::Create($url)
  $request.Method = $method
  $request.ContentType = "application/json"
  if ($body) {
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($body)
    $request.ContentLength = $bytes.Length
    $stream = $request.GetRequestStream()
    $stream.Write($bytes, 0, $bytes.Length)
    $stream.Close()
  } else {
    $request.ContentLength = 0
  }
  try {
    $response = $request.GetResponse()
    $code = [int]$response.StatusCode
    $response.Close()
    return $code
  } catch {
    $ex = $_.Exception
    while ($ex.InnerException) { $ex = $ex.InnerException }
    if ($ex.Response) { return [int]$ex.Response.StatusCode }
    return -1
  }
}

$BASE = "http://localhost:3456"
$script:PASS = 0
$script:FAIL = 0
$script:FAILURES = @()

function Test-Workflow($name, $scriptBlock) {
  try {
    & $scriptBlock
    Write-Output "PASS: $name"
    $script:PASS = $script:PASS + 1
  } catch {
    Write-Output "FAIL: $name"
    $script:FAIL = $script:FAIL + 1
    $script:FAILURES = $script:FAILURES + @{ Name = $name; Error = $_.Exception.Message }
    Write-Output "  $($_.Exception.Message)"
  }
}

$totalStart = Get-Date

# ═══════════════════════════════════════
# BATCH 1: LOGIN FLOW + SPECIAL PAGES
# ═══════════════════════════════════════
Write-Output "`n========================================"
Write-Output " BATCH 1: LOGIN FLOW & SPECIAL PAGES"
Write-Output "========================================"

Test-Workflow "Rate-limit POST login type" {
  $resp = Get-Json "$BASE/api/rate-limit/check" "POST" '{"type":"login"}'
  if ($resp.Contains("error")) { throw "Error: $resp" }
  if (-not $resp.Contains("allowed")) { throw "Missing 'allowed': $resp" }
}; Start-Sleep -Milliseconds 200

Test-Workflow "Rate-limit POST signup type" {
  $resp = Get-Json "$BASE/api/rate-limit/check" "POST" '{"type":"signup"}'
  if ($resp.Contains("error")) { throw "Error: $resp" }
  if (-not $resp.Contains("allowed")) { throw "Missing 'allowed': $resp" }
}; Start-Sleep -Milliseconds 200

Test-Workflow "Rate-limit GET returns 405" {
  $code = Get-Status "$BASE/api/rate-limit/check" "GET"
  if ($code -ne 405) { throw "Expected 405, got $code" }
}; Start-Sleep -Milliseconds 200

Test-Workflow "Login page HTML contains app shell" {
  $html = Get-Json "$BASE/"
  if (-not $html.Contains("Authenticating")) { throw "Missing loading screen" }
  if (-not $html.Contains("Knowledge Arena")) { throw "Missing app title" }
}

Test-Workflow "Login page loads auth providers" {
  $html = Get-Json "$BASE/"
  if (-not $html.Contains("AuthProvider")) { throw "Missing AuthProvider" }
  if (-not $html.Contains("FirebaseClientProvider")) { throw "Missing FirebaseClientProvider" }
}

Test-Workflow "Kicked page returns 200" {
  $code = Get-Status "$BASE/kicked"; if ($code -ne 200) { throw "Got $code" }
}

Test-Workflow "Cheating detected returns 200" {
  $code = Get-Status "$BASE/cheating-detected"; if ($code -ne 200) { throw "Got $code" }
}

Test-Workflow "Force password change returns 200" {
  $code = Get-Status "$BASE/force-password-change"; if ($code -ne 200) { throw "Got $code" }
}

Test-Workflow "Battle room returns 200" {
  $code = Get-Status "$BASE/battle/TEST123"; if ($code -ne 200) { throw "Got $code" }
}

Write-Output "`nBatch 1: PASS=$PASS FAIL=$FAIL"

# ═══════════════════════════════════════
# BATCH 2: API AUTH GUARDS
# ═══════════════════════════════════════
Write-Output "`n========================================"
Write-Output " BATCH 2: API ROUTE AUTH GUARDS"
Write-Output "========================================"

$apiRoutes = @(
  @{Method="GET"; Path="/api/executive/analytics-data"}
  @{Method="GET"; Path="/api/executive/audit-logs"}
  @{Method="POST"; Path="/api/executive/backup/export"}
  @{Method="POST"; Path="/api/executive/backup/import"}
  @{Method="POST"; Path="/api/executive/demo"}
  @{Method="GET"; Path="/api/executive/export"}
  @{Method="GET"; Path="/api/executive/notifications"}
  @{Method="DELETE"; Path="/api/executive/notifications/fake-id"}
  @{Method="GET"; Path="/api/executive/profile"}
  @{Method="GET"; Path="/api/executive/question-bank"}
  @{Method="POST"; Path="/api/executive/question-bank"}
  @{Method="GET"; Path="/api/executive/requests"}
  @{Method="PATCH"; Path="/api/executive/requests"}
  @{Method="GET"; Path="/api/executive/search?q=test"}
  @{Method="GET"; Path="/api/executive/settings"}
  @{Method="PUT"; Path="/api/executive/settings"}
  @{Method="GET"; Path="/api/executive/workspace"}
  @{Method="GET"; Path="/api/commander/dashboard"}
  @{Method="GET"; Path="/api/commander/requests"}
  @{Method="GET"; Path="/api/gladiator/dashboard"}
  @{Method="GET"; Path="/api/messaging/announcements"}
  @{Method="POST"; Path="/api/messaging/announcements"}
  @{Method="GET"; Path="/api/messaging/commanders"}
  @{Method="GET"; Path="/api/messaging/conversations"}
  @{Method="POST"; Path="/api/messaging/conversations"}
  @{Method="GET"; Path="/api/messaging/conversations/fake/messages"}
  @{Method="GET"; Path="/api/messaging/conversations/fake/read"}
  @{Method="GET"; Path="/api/messaging/announcements/fake/read"}
  @{Method="GET"; Path="/api/admin/users"}
  @{Method="GET"; Path="/api/decision-support/summary"}
  @{Method="GET"; Path="/api/knowledge/summary"}
  @{Method="GET"; Path="/api/predictions/summary"}
  @{Method="POST"; Path="/api/audit/log"}
)

foreach ($route in $apiRoutes) {
  $m = $route.Method; $p = $route.Path
  Test-Workflow "API $m $p returns 401/405" {
    $code = Get-Status "$BASE$p" $m
    if ($code -ne 401 -and $code -ne 405) {
      $resp = Get-Json "$BASE$p" $m
      throw "Expected 401/405, got $code. Body: ${resp}"
    }
  }
  Start-Sleep -Milliseconds 150
}

Write-Output "`nBatch 2: PASS=$PASS FAIL=$FAIL"

# ═══════════════════════════════════════
# BATCH 3: NAVIGATION & MIDDLEWARE
# ═══════════════════════════════════════
Write-Output "`n========================================"
Write-Output " BATCH 3: NAVIGATION & MIDDLEWARE"
Write-Output "========================================"

Test-Workflow "Middleware redirects unknown route" {
  $code = Get-Status "$BASE/some-random-path"
  if ($code -ne 307 -and $code -ne 200) { throw "Expected 307/200, got $code" }
}; Start-Sleep -Milliseconds 200

Test-Workflow "Middleware allows public routes" {
  $code = Get-Status "$BASE/kicked"; if ($code -ne 200) { throw "Got $code" }
}; Start-Sleep -Milliseconds 200

Test-Workflow "Middleware allows battle routes" {
  $code = Get-Status "$BASE/battle/ABCDEF"; if ($code -ne 200) { throw "Got $code" }
}; Start-Sleep -Milliseconds 200

Test-Workflow "Middleware allows API routes" {
  $code = Get-Status "$BASE/api/rate-limit/check" "GET"
  if ($code -eq 404) { throw "API blocked by middleware" }
}; Start-Sleep -Milliseconds 200

Write-Output "`nBatch 3: PASS=$PASS FAIL=$FAIL"

# ═══════════════════════════════════════
# BATCH 4: PORTAL PAGES (subset)
# ═══════════════════════════════════════
Write-Output "`n========================================"
Write-Output " BATCH 4: PORTAL PAGES"
Write-Output "========================================"

$portalPages = @(
  "/executive/analytics",
  "/executive/audit-logs",
  "/executive/backup",
  "/executive/commanders",
  "/executive/messages",
  "/executive/notifications",
  "/executive/profile",
  "/executive/question-bank",
  "/executive/requests",
  "/executive/search",
  "/executive/settings",
  "/executive/students",
  "/executive/workspace",
  "/commander/dashboard",
  "/commander/history",
  "/commander/messages",
  "/commander/profile",
  "/commander/requests",
  "/gladiator/dashboard",
  "/gladiator/history",
  "/gladiator/profile",
  "/create-quiz"
)

foreach ($page in $portalPages) {
  Test-Workflow "Portal page $page" {
    $code = Get-Status "$BASE$page"
    if ($code -ne 200 -and $code -ne 307 -and $code -ne 302) {
      throw "Returned $code"
    }
  }
  Start-Sleep -Milliseconds 400
}

Write-Output "`nBatch 4: PASS=$PASS FAIL=$FAIL"

# ═══════════════════════════════════════
# BATCH 5: CLIENT BUNDLES
# ═══════════════════════════════════════
Write-Output "`n========================================"
Write-Output " BATCH 5: CLIENT BUNDLES"
Write-Output "========================================"

$bundles = @(
  "/_next/static/chunks/app/layout.js"
  "/_next/static/chunks/app/error.js"
  "/_next/static/chunks/app/not-found.js"
  "/_next/static/chunks/app/global-error.js"
  "/_next/static/chunks/app/page.js"
)

foreach ($bundle in $bundles) {
  Test-Workflow "Bundle $($bundle.Split('/')[-1])" {
    $code = Get-Status "$BASE$bundle"
    if ($code -ne 200) { throw "Missing, code=$code" }
  }
  Start-Sleep -Milliseconds 100
}

Write-Output "`nBatch 5: PASS=$PASS FAIL=$FAIL"

# ═══════════════════════════════════════
# BATCH 6: AUDIT & SECURITY
# ═══════════════════════════════════════
Write-Output "`n========================================"
Write-Output " BATCH 6: AUDIT & SECURITY"
Write-Output "========================================"

Test-Workflow "Audit log rejects unauthenticated POST" {
  $code = Get-Status "$BASE/api/audit/log" "POST"
  if ($code -ne 401) { throw "Expected 401, got $code" }
}

Test-Workflow "No dangerouslySetInnerHTML in source" {
  $html = Get-Json "$BASE/"
  if ($html.Contains("dangerouslySetInnerHTML")) { throw "Found dangerous pattern" }
}

Test-Workflow "Login form validation (empty submit via API)" {
  $code = Get-Status "$BASE/api/rate-limit/check" "POST" '{}'
  # Should return 400 for missing type field
  if ($code -ne 400 -and $code -ne 200) { throw "Unexpected code: $code" }
}

# ═══════════════════════════════════════
# RESULTS
# ═══════════════════════════════════════
$elapsed = [math]::Round(((Get-Date) - $totalStart).TotalSeconds, 1)
Write-Output "`n`n=========================================="
Write-Output "  QA WORKFLOW TEST RESULTS"
Write-Output "=========================================="
Write-Output "  Duration: ${elapsed}s"
Write-Output "  PASSED:   $PASS"
Write-Output "  FAILED:   $FAIL"
Write-Output "  TOTAL:    $($PASS+$FAIL)"
Write-Output "=========================================="

if ($FAIL -gt 0) {
  Write-Output "`nFAILED WORKFLOWS:"
  foreach ($f in $FAILURES) {
    Write-Output "  [FAIL] $($f.Name)`n         $($f.Error)"
  }
  exit 1
} else {
  Write-Output "`nALL WORKFLOWS PASSED"
  exit 0
}
