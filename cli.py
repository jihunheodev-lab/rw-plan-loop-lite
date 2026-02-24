import argparse


def main():
    parser = argparse.ArgumentParser(description="rw-3agent-lite CLI")
    subparsers = parser.add_subparsers(dest="command")

    subparsers.add_parser("hello", help="Print Hello, World!")

    args = parser.parse_args()

    if args.command == "hello":
        print("Hello, World!")
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
