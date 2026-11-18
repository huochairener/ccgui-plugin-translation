$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$requestData = [Console]::In.ReadToEnd() | ConvertFrom-Json
$httpArgs = @{ Uri = $requestData.url; Method = $requestData.method; TimeoutSec = 25; SkipHttpErrorCheck = $true }
if ($requestData.headers) {
    $httpHeaders = @{}
    foreach ($httpProperty in $requestData.headers.PSObject.Properties) { $httpHeaders[$httpProperty.Name] = [string]$httpProperty.Value }
    $httpArgs.Headers = $httpHeaders
}
if ($null -ne $requestData.body) { $httpArgs.Body = [System.Text.Encoding]::UTF8.GetBytes([string]$requestData.body) }
try {
    $httpResponse = Invoke-WebRequest @httpArgs
    @{ status = [int]$httpResponse.StatusCode; body = [string]$httpResponse.Content } | ConvertTo-Json -Compress -Depth 5
} catch {
    @{ status = 0; body = ''; error = 'Network request failed' } | ConvertTo-Json -Compress
    exit 1
}
