# Scraper Source Contracts (V2)

## Galle (`galle`)
- Listing URL: `https://gallemakelaars.nl/scheepsaanbod`
- Listing selector: `.cat-product-small`
- Required listing fields: `source_id`, `name`, `url`
- Detail fetch selector: `.product-specs`
- Minimum healthy listing count: 12

## RensenDriessen (`rensendriessen`)
- Listing endpoint: `https://api.rensendriessen.com/api/public/ships/brokers/list/filter/`
- Request shape: `POST` JSON `{"page": n}`
- Expected response shape: list or object with `results`/`data`
- Required listing fields: `ship_id|id`, `shipname`
- Minimum healthy listing count: 20

## PC Shipbrokers (`pcshipbrokers`)
- Listing URL: `https://pcshipbrokers.com/scheepsaanbod`
- Required script payload key: `compareShipData`
- Required listing fields: `source_id`, `name`, `url`
- Detail fetch input: `https://pcshipbrokers.com/ships/{slug}`
- Minimum healthy listing count: 40

## GTS Schepen (`gtsschepen`)
- Listing URL: `https://www.gtsschepen.nl/schepen/`
- Listing selector: `.grid-item`
- Required listing fields: `source_id`, `name`, `url`
- Detail fetch selectors: `.data-row`, `.row-label`, `.row-info`
- Minimum healthy listing count: 40

## GSK (`gsk`)
- GraphQL endpoint: `https://www.gskbrokers.eu/graphql`
- Listing operation: `GetVessels(skip, limit)`
- Required listing fields: `slug|id`, `vesselName`, `general.status`
- Detail operation: `getVesselBySlug(slug)`
- Minimum healthy listing count: 50
