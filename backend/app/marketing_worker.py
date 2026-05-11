import argparse
import time

from app.db.session import SessionLocal
from app.services.marketing import tick_marketing


def run_once(limit: int = 100) -> dict[str, int]:
    db = SessionLocal()
    try:
        return tick_marketing(db, limit=limit)
    finally:
        db.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Priddyspaces marketing worker")
    parser.add_argument("--interval", type=int, default=60)
    parser.add_argument("--limit", type=int, default=100)
    parser.add_argument("--once", action="store_true")
    args = parser.parse_args()

    while True:
        result = run_once(limit=args.limit)
        print(result, flush=True)
        if args.once:
            break
        time.sleep(args.interval)


if __name__ == "__main__":
    main()
