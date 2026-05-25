# Hotel Official Rate Window Snapshots

- Generated at: 2026-05-25T23:13:21.644Z
- Window: 2026-05-26 to 2026-06-01 (7 one-night stays)
- Snapshot rows: 3205
- Official tax-inclusive dynamic average rows: 1616
- Official tax-inclusive rows without tax estimate: 895
- Estimated tax-inclusive rows from official pre-tax rates: 721
- IHG 7-night window rows: 887
- IHG full 7-sample rows: 520
- IHG partial-window rows: 367
- Marriott 7-night window rows: 710
- Hyatt 7-night window rows: 11
- Hilton current lead-rate rows: 1043
- SQLite: hotel-guide/database/hotel-rate-snapshots.sqlite

## Coverage by Chain

| Chain | Rows | Dynamic rate rows |
| --- | ---: | ---: |
| Aman | 4 | 0 |
| Four Seasons | 11 | 0 |
| Hilton | 1133 | 0 |
| hyatt | 128 | 11 |
| IHG Hotels & Resorts | 1000 | 887 |
| Mandarin Oriental | 10 | 0 |
| Marriott | 803 | 710 |
| Rosewood | 6 | 0 |
| Shangri-La | 66 | 0 |
| Small Luxury Hotels of the World | 30 | 0 |
| The Leading Hotels of the World | 11 | 8 |
| The Peninsula | 3 | 0 |

## Status Counts

| Status | Rows |
| --- | ---: |
| available_full_window | 1195 |
| available_current_lead_rate_tax_unknown | 1043 |
| available_partial_window | 421 |
| adapter_pending_luxury_group_booking_flow | 130 |
| hyatt_roomrates_fetch_failed_or_blocked | 116 |
| ihg_calendar_no_product | 110 |
| marriott_hqv_no_available_rate | 93 |
| hilton_extract_no_numeric_lead_rate | 90 |
| ihg_calendar_no_tax_inclusive_lowest_rate | 3 |
| lhw_findrooms_fetch_failed | 3 |
| hyatt_roomrates_no_available_public_rate | 1 |

## Average by Chain and Currency

| Chain Currency | Count | Average | Min | Max |
| --- | ---: | ---: | ---: | ---: |
| hyatt CNY | 11 | 1068.61 | 388.28 | 2332 |
| IHG Hotels & Resorts HKD | 10 | 1738.73 | 744.7 | 4462.69 |
| IHG Hotels & Resorts CNY | 857 | 555.15 | 192.3 | 10155.55 |
| IHG Hotels & Resorts MOP | 3 | 899.14 | 847.64 | 967.18 |
| IHG Hotels & Resorts TWD | 17 | 7345.91 | 2913.57 | 16381.43 |
| Marriott HKD | 16 | 2221.04 | 769.73 | 5811.34 |
| Marriott CNY | 660 | 837.98 | 214.19 | 19846.99 |
| Marriott MOP | 3 | 2061.95 | 1886.82 | 2256.21 |
| Marriott TWD | 31 | 8373.8 | 2797.4 | 31630.25 |
| The Leading Hotels of the World CNY | 8 | 3305.47 | 1387 | 5848.66 |

## Notes

- IHG uses the official availability-calendar API and computes a 7-night average from nightly tax-inclusive lowest rates.
- IHG tax fields: final/tax-inclusive average, pre-tax average, aggregate tax-and-fee amount/rate. The calendar API does not expose individual tax lines.
- Marriott uses the official HQV GraphQL pre-tax amount and estimates tax-inclusive fields with 10% service charge plus 6% VAT by default.
- Hyatt uses official roomrates public Standard-rate pre-tax values and estimates tax-inclusive fields with 10% service charge plus 6% VAT by default.
- Hilton current lead rates are retained as tax-unknown pre-tax/proxy fields and are excluded from the final tax-inclusive average.
- Luxury-group rows without a confirmed rate adapter remain explicit adapter-pending rows in this snapshot.
