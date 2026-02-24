import subprocess
import sys


def test_hello_stdout():
    """python cli.py hello prints 'Hello, World!' to stdout."""
    result = subprocess.run(
        [sys.executable, "cli.py", "hello"],
        capture_output=True,
        text=True,
    )
    assert result.stdout == "Hello, World!\n"


def test_hello_exit_code():
    """python cli.py hello exits with code 0."""
    result = subprocess.run(
        [sys.executable, "cli.py", "hello"],
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0
