param(
    [switch]$StartServer,
    [switch]$SkipNpmInstall
)

$ErrorActionPreference = 'Stop'

function Write-Step {
    param([string]$Message)
    Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Resolve-PythonCommand {
    $preferredVersions = @('3.12', '3.11', '3.10')

    if (Get-Command py -ErrorAction SilentlyContinue) {
        foreach ($version in $preferredVersions) {
            try {
                $null = & py -$version -c "import sys; print(sys.version)" 2>$null
                return @('py', "-$version")
            }
            catch {
                continue
            }
        }

        try {
            $null = & py -c "import sys; print(sys.version)" 2>$null
            return @('py')
        }
        catch {
        }
    }

    if (Get-Command python -ErrorAction SilentlyContinue) {
        try {
            $null = & python -c "import sys; print(sys.version)" 2>$null
            return @('python')
        }
        catch {
        }
    }

    throw 'No usable Python interpreter found. Install Python 3.10+ and ensure py or python is on PATH.'
}

try {
    $repoRoot = Split-Path -Parent $PSScriptRoot
    Set-Location $repoRoot

    if (-not (Test-Path '.\package.json')) {
        throw 'package.json not found. Run this script from inside the dtr-ocr-system repository.'
    }

    if (-not $SkipNpmInstall) {
        Write-Step 'Installing Node dependencies (npm install)...'
        npm install
    }

    Write-Step 'Selecting Python interpreter...'
    $pythonCmd = Resolve-PythonCommand
    Write-Host "Using: $($pythonCmd -join ' ')" -ForegroundColor DarkGray

    if (-not (Test-Path '.\.venv-local\Scripts\python.exe')) {
            Write-Step 'Creating virtual environment (.venv-local)...'
            $pythonArgs = @()
            if ($pythonCmd.Length -gt 1) {
                $pythonArgs += $pythonCmd[1..($pythonCmd.Length - 1)]
            }
            $pythonArgs += @('-m', 'venv', '.venv-local')
            & $pythonCmd[0] @pythonArgs
    }
    else {
        Write-Step 'Virtual environment already exists (.venv-local).'
    }

    $venvPython = '.\.venv-local\Scripts\python.exe'

    Write-Step 'Upgrading pip/setuptools/wheel...'
    & $venvPython -m pip install --upgrade pip setuptools wheel

    Write-Step 'Installing Local OCR dependencies...'
    & $venvPython -m pip install -r requirements-local-ocr.txt

    Write-Step 'Setup complete.'
    Write-Host 'Next steps:' -ForegroundColor Green
    Write-Host '1) Add API keys to .env (Gemini/OpenRouter as needed).' -ForegroundColor Green
    Write-Host '2) Start frontend: npm start' -ForegroundColor Green
    Write-Host '3) Start local OCR: .\.venv-local\Scripts\python.exe .\ocr_server.py' -ForegroundColor Green

    if ($StartServer) {
        Write-Step 'Starting Local OCR server on http://0.0.0.0:5000 ...'
        $env:PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK = 'True'
        & $venvPython .\ocr_server.py
    }
}
catch {
    Write-Host "Setup failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
