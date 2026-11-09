"""Build oncall_sre_lambda.zip for AWS Lambda (python3.12, x86_64) without Docker.

    cd backend && uv run python package_lambda.py

Installs Linux wheels with uv, so it works from Windows. boto3 is already in the Lambda runtime.
"""
from __future__ import annotations

import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
BUILD = HERE / "build_lambda"
OUT = HERE / "oncall_sre_lambda.zip"
DEPS = ["fastapi>=0.115", "pydantic>=2.7", "pyjwt[crypto]>=2.8", "python-dotenv>=1.0", "mangum>=0.17"]


def main() -> None:
    shutil.rmtree(BUILD, ignore_errors=True)
    BUILD.mkdir()
    subprocess.run(
        ["uv", "pip", "install", "--quiet", "--target", str(BUILD), "--python-version", "3.12",
         "--python-platform", "x86_64-manylinux2014", "--only-binary", ":all:", *DEPS],
        check=True,
    )
    shutil.copytree(HERE / "sre", BUILD / "sre", ignore=shutil.ignore_patterns("__pycache__"))
    OUT.unlink(missing_ok=True)
    with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as z:
        for p in BUILD.rglob("*"):
            if p.is_file() and "__pycache__" not in p.parts:
                z.write(p, p.relative_to(BUILD))
    shutil.rmtree(BUILD, ignore_errors=True)
    print(f"built {OUT} ({OUT.stat().st_size / 1e6:.1f} MB)")
    if OUT.stat().st_size > 50e6:
        sys.exit("zip is over 50 MB: upload it through S3 instead of a direct Lambda upload")


if __name__ == "__main__":
    main()
