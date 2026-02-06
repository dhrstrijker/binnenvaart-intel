import scrape_rensendriessen
import scrape_galle


def main():
    print("Starting scrape...")

    print("\n--- RensenDriessen ---")
    rd_stats = scrape_rensendriessen.scrape()
    print(f"  Total: {rd_stats['total']}")
    print(f"  Inserted: {rd_stats['inserted']}")
    print(f"  Price changed: {rd_stats['price_changed']}")
    print(f"  Unchanged: {rd_stats['unchanged']}")

    print("\n--- Galle ---")
    galle_stats = scrape_galle.scrape()
    print(f"  Total: {galle_stats['total']}")
    print(f"  Inserted: {galle_stats['inserted']}")
    print(f"  Price changed: {galle_stats['price_changed']}")
    print(f"  Unchanged: {galle_stats['unchanged']}")

    total = rd_stats["total"] + galle_stats["total"]
    print(f"\nDone. {total} vessels processed.")


if __name__ == "__main__":
    main()
