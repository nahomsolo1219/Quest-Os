# Quest Meals OS: specification (verbatim copy of documents 1 to 8 of QUEST_MEALS_BUILD_PROMPT.md)

Do not edit requirements here. Record changes and interpretations in DECISIONS.md.

<project_documents>

<document index="1" name="business_context">

## Who this is for

Quest Meals is a new B2C meal-prep subscription business in Addis Ababa, Ethiopia. It cooks out of the kitchen of Adorsi Cafe. The brand is fronted by two athletes, Dagi and Kidus, who also act as coaches to subscribers. Fahim owns the cafe and the kitchen. Nebiyou runs day-to-day operations. A nutritionist sets each client's calorie and macro targets. Nahom is the consultant who designed this system and will own the codebase.

Clients subscribe to a plan, get a calorie target and macros from the nutritionist, and receive three meals and a snack every service day, delivered or picked up at the cafe. The business is starting from zero clients and expects to grow to roughly 50 to 100 active subscribers in the first year.

## Why this system exists

Without it, every client, order, payment and shopping list would live in WhatsApp threads, notebooks and memory, which breaks at around 10 to 15 clients. The kitchen would re-type orders, purchasing would be guesswork, and nobody would know food cost or margin. This app replaces all of that with one system that runs the business from a client's first enquiry to the meal on their table.

## Local facts the app must respect

- Currency: Ethiopian birr (ETB). Show amounts as whole birr with thousands separators, for example "58,400 ETB".
- Time zone: Africa/Addis_Ababa (UTC+3, no daylight saving). Every cutoff, schedule and "today" is computed in this zone, never in the server's zone.
- Calendar: Gregorian dates in the UI. Do not implement the Ethiopian calendar.
- Phone numbers: Ethiopian mobile numbers, stored in E.164 (`+2519XXXXXXXX` or `+2517XXXXXXXX`). Accept input as `09...`, `07...`, `9...`, `+251...` and normalise.
- Payments: there is no payment gateway. Clients pay by Telebirr, CBE (Commercial Bank of Ethiopia) transfer or cash at pick-up, then upload a receipt photo. Staff confirm receipts by hand.
- Connectivity: phones on mobile data, sometimes slow. Pages must be light, fast on 3G, and work as an installable PWA. Staff screens are used on phones and on one laptop in the kitchen.
- Language: English UI for now. Keep all user-facing strings in one place per feature so Amharic can be added later, but do not build an i18n framework now.

</document>

<document index="2" name="approved_project_brief">

## Summary

Quest Meals OS is one web app that runs the business: sign-up, macros, plan, payment, weekly orders, kitchen production, inventory, delivery, client app and a subscriber community.

Goals for launch:
- Every client has one record: goal, size, macros, swaps, plan, payments, address.
- The kitchen gets an automatic production sheet, packing list and labels for every cook day, with no retyping.
- Purchasing comes from the menu and client count, not guesswork; stock and spend are logged.
- Owners see clients, revenue, food cost and margin on one screen.
- Nobody gets cooked for without paying, and every change goes through a cutoff.
- Subscribers have a community inside the app that keeps them motivated.

## Roles

| Role | Who | Sees and does |
| --- | --- | --- |
| Owner | Dagi, Kidus, Fahim | Dashboard (clients, revenue, food cost, margin), all records, pricing and plan settings, partner contribution log. Dagi and Kidus are also flagged as coaches in the community. |
| Operations | Nebiyou | Clients, payments, orders, quick starts, purchasing, inventory, delivery routes; runs the weekly cycle |
| Nutritionist | The nutritionist | Client intake, sets calorie target, size and macros, approves swaps, logs check-ins and progress |
| Kitchen | Head cook and staff | Production sheet, recipe cards with portions per profile, packing list, labels, stock counts |
| Delivery | Riders | Today's drops in route order, address and phone, mark delivered or failed |
| Client | Subscribers | Sign-up, their plan and macros, this week's menu, swaps, pause, payments, progress, community |

One person can hold more than one role (for example Nebiyou as operations and delivery). Model roles as a set per user, not a single value.

## Client journey

1. Lead comes in (Instagram, referral, walk-in).
2. Lead uses the calorie calculator on the public site.
3. Consult with the nutritionist (in person or phone; the app records it).
4. Sign-up form: body stats, goal, allergies, dislikes, address, delivery or pick-up.
5. Nutritionist confirms macros and size.
6. Plan chosen: package (Essential, Performance, Premium) and goal (Lean or Build).
7. Swaps set, up to the plan's limit, from the swap table.
8. Payment: client pays and uploads a receipt; ops confirms.
9. Weekly loop: order locks at the Thursday cutoff, kitchen cooks and packs, delivery or pick-up, check-in. Repeats until the client pauses, ends or renews.

The first eight steps happen once per client. Changes (swaps, size, pause, address) only enter at the weekly cutoff.

## Quick start: starting tomorrow

Anyone who signs up and pays by 6 pm starts the next service day. Nobody is turned away for missing the Thursday cutoff. No extra portions are cooked in advance, so there is no spill: quick-start meals are cooked to order on the next day's production sheet. The weekly cutoff still governs changes for existing clients.

| Cutoff | Time (Addis) | What it covers |
| --- | --- | --- |
| Weekly cutoff | Thursday 18:00 | Next week's orders, swaps, pauses, size and address changes |
| Quick-start cutoff | Every day, 18:00 | New clients starting the next service day |

How it works:
1. Cooked to order. At 18:00 the app adds every paid quick-start client to the next day's production sheet and packing list. Nothing is cooked on spec.
2. Raw safety stock, not cooked buffer. The kitchen keeps 2 to 3 days of raw stock that keeps well (rice, oats, pasta, oil, frozen chicken and beef). Fresh items needed for quick starts are added to the next morning's purchase list.
3. Instant set-up. The calculator assigns the size from the sign-up form. The client starts on the standard menu with no swaps; the nutritionist confirms or adjusts within 48 hours.
4. Pay to start. The client pays for the service days left in the current week (price per day × days) and uploads the receipt; ops confirms before 18:00.
5. Delivery. The first drop is added to tomorrow's route, or the client picks up at the cafe.
6. Join the cycle. From the next Thursday cutoff they are a normal weekly client.
7. Kitchen at capacity. If the daily quick-start maximum is reached, the app offers the next available start date.

## Business rules the system enforces

1. Pay before cooking. A client whose payment is not confirmed by the relevant cutoff is left out of the order it would have joined.
2. One cutoff for changes. Swaps, pauses, address changes and size changes take effect from the next week, only if made before Thursday's cutoff. New clients are the exception: they can start the next day through quick start.
3. Swap limit by plan. Each plan sets its own number of standing swaps (default Essential 3, Performance 6, Premium 10), only from the swap table. Anything else needs nutritionist approval.
4. Size follows the nutritionist. A client cannot change their own calorie target or size; they can request it.
5. Freshness. Food is delivered no more than 3 days after cooking. Fish and injera meals are labelled "eat within 2 days". Every label prints a cook date and an eat-by date.
6. Pause rules. Pauses are taken in whole weeks; paused days extend the plan, they are not refunded.
7. Price lock. Price comes from the pricing formula. Manual discounts need an owner and are logged with who and why.
8. Stock in and out. Every purchase is logged with price; a stock count is done every Sunday before the week's cooking.

## Modules (all fourteen are in phase 1)

| # | Module | What it does | Main user |
| --- | --- | --- | --- |
| 1 | Clients and onboarding | Lead list, sign-up form (age, sex, weight, height, activity, goal, allergies, dislikes, address), status: lead, active, paused, ended | Ops |
| 2 | Nutrition engine | Calculates TDEE and calorie target, assigns size S / M / L (1,600 / 2,100 / 2,700 kcal), macro split by goal (Lean or Build); nutritionist can override | Nutritionist |
| 3 | Menu and recipes | Menus A to D with each meal built from parts (protein, carb, veg, fat, sauce); grams per portion profile; macros and cost per portion calculated from ingredients | Owners, kitchen |
| 4 | Swaps | Like-for-like swap table (for example no beans → extra chicken); swap limit set by the client's plan; extra protein as a paid add-on | Nutritionist, client |
| 5 | Plans and pricing | Essential / Performance / Premium, daily delivery or pick-up; price from the pricing formula; discounts | Owners |
| 6 | Payments | Weekly or monthly invoice; client pays by Telebirr, CBE or cash and uploads the receipt; ops confirms; unpaid = not cooked | Ops |
| 7 | Weekly orders and quick start | Locks every active, paid client's week at the Thursday cutoff: days, meals, profile, swaps, pauses. Adds paid quick-start clients to the next day's sheet at 18:00 | Ops |
| 8 | Kitchen production | Production sheet (total grams of each part per cook day), recipe cards, packing list per client, printable labels with name, meal, macros, cook date and eat-by date | Kitchen |
| 9 | Inventory and purchasing | Shopping list from the locked orders minus stock; purchase log with supplier and price; stock counts; waste log | Ops, kitchen |
| 10 | Delivery and pick-up | Daily drop list grouped by area, rider view, delivered / failed status, pick-up list for the cafe counter | Delivery |
| 11 | Client app | Phone web app: my plan, my macros, this week's menu, request swaps, pause, pay, log weight | Client |
| 12 | Check-ins and progress | Weekly weight, nutritionist notes, adherence, renewal reminders | Nutritionist |
| 13 | Dashboard and partner log | KPIs (active clients, MRR, food cost %, margin, churn, on-time delivery) and the partner contribution log | Owners |
| 14 | Community | Subscriber-only feed inside the client app: progress posts and photos (opt-in), weekly challenges and check-in streaks, posts and Q&A from Dagi and Kidus, meal ratings and comments; ops can hide posts and mute members | Clients, owners |

## Weekly rhythm

| Day | What the app does | Who acts |
| --- | --- | --- |
| Tuesday | Reminds clients: swaps, pauses and payment due by Thursday | App |
| Thursday 18:00 | Locks next week's orders for paid, active clients | App, ops checks |
| Friday | Builds the shopping list: total grams needed minus stock on hand | Ops |
| Saturday | Purchases logged with supplier and price | Ops |
| Sunday | Stock count; production sheets, packing lists and labels ready to print for Monday | Kitchen |
| Every day 18:00 | Quick-start clients added to the next day's sheet; next morning's top-up purchase list updated | App, ops |
| Each service day | Cook, pack, deliver or hand over at pick-up; drops marked delivered | Kitchen, riders |
| Every week | Check-ins logged; dashboard updates | Nutritionist, owners |

## Data model (core records)

| Record | Key fields | Links to |
| --- | --- | --- |
| Client | Name, phone, address, area, body stats, goal, allergies, dislikes, status | Plan, swaps, payments, check-ins |
| Nutrition profile | TDEE, calorie target, size (S/M/L), protein / carb / fat grams, set by, date | Client |
| Plan subscription | Package, swap limit, delivery or pick-up, start, end, price, status | Client, payments |
| Ingredient | Name, purchase unit, cost per unit, kcal and macros per 100 g (or per piece), supplier, food group | Parts, purchases, stock |
| Part | For example grilled chicken, rice, gomen; recipe; grams per portion profile | Ingredients, meals |
| Meal | Menu (A to D), slot (breakfast, lunch, dinner, snack), parts | Menu day |
| Swap rule | From part → to part, extra cost | Client swaps |
| Weekly order | Week, client, days, profile, swaps applied, locked at, quick start flag | Client, meals, delivery |
| Payment | Amount, method, receipt image, confirmed by, date | Plan subscription |
| Purchase and stock | Ingredient, quantity, price, date; counts and waste | Ingredient |
| Delivery drop | Date, client, rider, status, time | Weekly order |
| Check-in | Date, weight, notes, adherence | Client |
| Community | Posts, comments, reactions, challenges, challenge check-ins, meal ratings, moderation actions | Client, owners |

These are the business records. Design the actual schema yourself (see the instructions), keeping these concepts and names recognisable.

## Tech stack

| Part | Choice | Why |
| --- | --- | --- |
| App | Next.js (App Router, TypeScript, strict mode), installable PWA | One codebase for staff and clients |
| Database | Railway Postgres, accessed with Drizzle ORM and SQL migrations | Everything on one platform; typed queries |
| Login | Better Auth (self-hosted in the app, sessions stored in the same Postgres) | Email + password for staff, phone + password for clients, no third-party auth service |
| Files | Railway Bucket (S3-compatible) through the AWS S3 SDK, private objects served by short-lived signed URLs | Receipt photos, community photos, avatars |
| Styling | Tailwind CSS and shadcn/ui | Fast, consistent, accessible components |
| Hosting | Railway only: the Next.js app service, the Postgres database, the bucket and cron services, all in one Railway project. Code lives on GitHub (nahomsolo1219/Quest-Os) and Railway deploys from it | The team wants all infrastructure on Railway and GitHub, nothing else |
| Scheduled jobs | Railway cron services that call the app's secured job routes | Same platform |
| Notifications | Telegram bot for staff and for clients who opt in; in-app notifications for everyone | Telegram is widely used in Ethiopia and free |
| Payments | Manual: Telebirr / CBE / cash, receipt upload, ops confirms | No gateway; deliberately out of scope |
| Printing | Print-ready HTML pages with print CSS (A4 sheets and label sheets) | Works with any printer |

## Out of scope

Native iOS or Android apps, an online payment gateway, rider GPS tracking, accounting and payroll, a public shop for one-off meals, Amharic translation, the Ethiopian calendar.

## Phases

- Phase 1 (this build): all fourteen modules above.
- Phase 2 (later, do not build): automatic renewals, margin-per-meal reports, waste and stock trend reports.

Gate before launch: one full dry-run week passes end to end. In this build that gate is the automated "week in the life" simulation described in the instructions.

</document>

<document index="3" name="nutrition_and_portioning_rules">

## Calorie target

1. BMR with Mifflin-St Jeor: men `10 × kg + 6.25 × cm − 5 × age + 5`; women `10 × kg + 6.25 × cm − 5 × age − 161`.
2. TDEE = BMR × activity factor: sedentary 1.2, light 1.375, moderate 1.55, very active 1.725, athlete 1.9.
3. Goal adjustment: Lean = TDEE × 0.80; Build = TDEE × 1.10. Both factors are settings the nutritionist can edit.
4. Size = the size whose calorie target is nearest the result: S 1,600, M 2,100, L 2,700 kcal a day (three meals and a snack). Ties go to the smaller size for Lean and the larger size for Build.
5. The nutritionist can override the size and the macro targets for any client. The app stores who set the values, when, and the computed suggestion next to the override.

## Macro split by goal (defaults, editable in settings)

| Goal | Protein | Carbs | Fat |
| --- | --- | --- | --- |
| Lean | 30% of kcal | 40% | 30% |
| Build | 25% | 50% | 25% |

Use 4 kcal per gram for protein and carbs, 9 for fat.

## Portion profiles: how the kitchen cooks

The kitchen cannot cook a different gram weight for every client. It cooks to six portion profiles: three sizes × two goals (S-Lean, S-Build, M-Lean, M-Build, L-Lean, L-Build). Every client is assigned one profile. Swaps and add-ons sit on top of the profile.

How profile grams are made:
1. Each meal has a base recipe (document 4) with grams per part. A base menu day comes to roughly 1,660 to 1,750 kcal.
2. Each part has a category: protein, carb, fat, veg, dairy, fruit, sauce or seasoning.
3. For each profile and each menu day, compute three scale factors (protein parts, carb and fruit parts, fat parts including oil, peanut butter and cheese) so that the day's total kcal is within ±3% of the size target and each macro is within ±10% of the goal split. Veg and sauce stay at base grams; seasonings are untracked. Dairy that is mainly protein (Greek yogurt, ayib) counts as protein.
4. Clamp every factor between 0.6 and 1.8. If the targets cannot be met inside the clamp, keep the closest result and flag the day for the nutritionist.
5. Round grams to the nearest 5 g, eggs and injera to whole pieces (egg whites to whole whites).
6. Store the computed grams per profile per part. The nutritionist reviews the profile table and can edit any cell; edited cells are kept and marked as manual on the next recompute.
7. Show every meal's kcal, protein, carbs and fat per profile, computed from ingredient nutrition (document 5).

## Freshness labels

- Default eat-by = cook date + 3 days.
- Meals containing fish or injera: eat-by = cook date + 2 days.
- Labels print: client first name and last initial, meal name, slot, profile, kcal / P / C / F, cook date, eat-by date, allergy note if any, "Reheat until steaming hot".

</document>

<document index="4" name="menu_seed_data">

Rotation: Monday A, Tuesday B, Wednesday C, Thursday D, Friday A, Saturday B, Sunday C. Service days default Monday to Saturday; Sunday's meals are delivered with Saturday's drop when Sunday is not a service day (this is a setting).

Each line is: part name | category | base amount | ingredient(s). "Seasoning" items are on the recipe card but not tracked in stock or macros.

### Menu A (Monday and Friday)

Breakfast: Peanut butter banana protein pancakes. Oat pancakes made with eggs, Greek yogurt and banana, peanut butter on top. Keeps 3 days.
- Oats | carb | 50 g | Oats
- Whole egg | protein | 1 piece | Eggs
- Egg whites | protein | 3 whites | Eggs (each white uses one egg)
- Greek yogurt | protein | 100 g | Greek yogurt
- Banana | fruit | 60 g (half a banana) | Banana
- Peanut butter | fat | 16 g (1 tbsp) | Peanut butter
- Cinnamon, stevia | seasoning | to taste | Cinnamon, Stevia

Lunch: Awaze chicken rice bowl. Baked chicken in awaze over rice, with sautéed cabbage and carrot. Keeps 3 days.
- Awaze chicken | protein | 130 g | Chicken breast
- Rice | carb | 45 g dry | Rice
- Sautéed cabbage and carrot | veg | 200 g | Cabbage 120 g, Carrot 80 g
- Oil | fat | 7 g (½ tbsp) | Cooking oil

Dinner: Rosemary beef with roast potatoes. Diced lean beef with rosemary and garlic, roast potatoes, zucchini, carrot and a garlic-yogurt sauce. Keeps 3 days.
- Rosemary beef | protein | 120 g | Lean beef, diced
- Roast potatoes | carb | 150 g | Potatoes
- Roast vegetables | veg | 200 g | Zucchini 100 g, Carrot 60 g, Onion 40 g
- Garlic-yogurt sauce | protein | 30 g | Greek yogurt
- Oil | fat | 13.5 g (1 tbsp) | Cooking oil

Snack: Fudgy protein brownie. Oat and cocoa brownie sweetened with stevia. Keeps 4 days.
- Oats | carb | 25 g | Oats
- Cocoa | carb | 10 g | Unsweetened cocoa
- Whole egg | protein | 1 piece | Eggs
- Greek yogurt | protein | 60 g | Greek yogurt
- Stevia, vanilla | seasoning | to taste | Stevia, Vanilla extract

### Menu B (Tuesday and Saturday)

Breakfast: Spinach and feta egg muffins. Three baked egg muffins with spinach, tomato and feta, with toast. Keeps 3 days.
- Whole eggs | protein | 2 pieces | Eggs
- Egg whites | protein | 4 whites | Eggs
- Spinach and tomato | veg | 80 g | Spinach 50 g, Tomatoes 30 g
- Feta | fat | 20 g | Feta
- Whole-wheat toast | carb | 60 g | Whole-wheat bread

Lunch: Beef and bean chili with rice. Lean beef and bean chili in a tomato and pepper sauce, over rice. Keeps 4 days.
- Lean minced beef | protein | 90 g | Lean minced beef
- Beans | carb | 40 g dry | Dry beans
- Rice | carb | 35 g dry | Rice
- Tomato and pepper sauce | sauce | 150 g | Tomatoes 100 g, Green peppers 30 g, Onion 20 g
- Oil | fat | 7 g | Cooking oil

Dinner: Chicken and broccoli pasta bake. Pasta baked with chicken, broccoli, carrot, garlic and a little mozzarella. Keeps 3 days.
- Pasta | carb | 50 g dry | Pasta
- Chicken | protein | 110 g | Chicken breast
- Broccoli and carrot | veg | 200 g | Broccoli 140 g, Carrot 60 g
- Mozzarella | fat | 15 g | Mozzarella
- Oil | fat | 7 g | Cooking oil

Snack: Banana oat muffins (2). Small muffins with oats, banana, egg, cinnamon and stevia. Keeps 4 days.
- Oats | carb | 30 g | Oats
- Banana | fruit | 60 g | Banana
- Whole egg | protein | 1 piece | Eggs
- Stevia, cinnamon, baking powder | seasoning | to taste | Stevia, Cinnamon, Baking powder

### Menu C (Wednesday and Sunday)

Breakfast: Chicken breakfast burrito. Scrambled eggs, chicken and tomato salsa in a whole-wheat tortilla. Keeps 3 days.
- Whole-wheat tortilla | carb | 60 g | Whole-wheat tortillas
- Whole eggs | protein | 2 pieces | Eggs
- Egg whites | protein | 2 whites | Eggs
- Chicken | protein | 50 g | Chicken breast
- Tomato salsa | sauce | 60 g | Tomatoes 50 g, Onion 10 g

Lunch: Doro tibs with gomen and injera. Chicken tibs with Habesha gomen, injera and ayib. Injera packed separately. Eat within 2 days.
- Doro tibs | protein | 130 g | Chicken breast
- Gomen and onion | veg | 200 g | Habesha gomen 170 g, Onion 30 g
- Injera | carb | 1 piece (about 120 g) | Injera
- Ayib | protein | 30 g | Ayib
- Oil | fat | 7 g | Cooking oil

Dinner: Lean beef lasagna. Layers of pasta, lean beef and tomato sauce with ayib and a little mozzarella. Keeps 4 days, freezes well.
- Lasagna sheets | carb | 50 g dry | Lasagna sheets
- Lean minced beef | protein | 100 g | Lean minced beef
- Tomato sauce with vegetables | sauce | 200 g | Tomatoes 130 g, Carrot 40 g, Onion 30 g
- Ayib | protein | 40 g | Ayib
- Mozzarella | fat | 15 g | Mozzarella

Snack: Chocolate peanut oat balls (3). No-bake balls with oats, peanut butter and cocoa, sweetened with stevia. Keeps 5 days.
- Oats | carb | 30 g | Oats
- Peanut butter | fat | 16 g | Peanut butter
- Cocoa | carb | 5 g | Unsweetened cocoa
- Milk | seasoning | splash (about 15 ml, tracked in stock only) | Milk
- Stevia | seasoning | to taste | Stevia

### Menu D (Thursday)

Breakfast: Apple cinnamon baked oats. Oats baked with Greek yogurt, egg, apple and cinnamon. Keeps 3 days.
- Oats | carb | 60 g | Oats
- Greek yogurt | protein | 150 g | Greek yogurt
- Whole egg | protein | 1 piece | Eggs
- Apple | fruit | 90 g (half an apple) | Apple
- Cinnamon, stevia | seasoning | to taste | Cinnamon, Stevia

Lunch: Honey-garlic chicken with sweet potato. Glazed chicken with roasted sweet potato and green beans. Keeps 3 days.
- Honey-garlic chicken | protein | 130 g | Chicken breast
- Sweet potato | carb | 150 g | Sweet potatoes
- Green beans | veg | 150 g | Green beans
- Honey | carb | 7 g (1 tsp) | Honey
- Oil | fat | 7 g | Cooking oil

Dinner: Lemon-herb tilapia with mash. Baked tilapia with lemon and herbs, mashed potato, cauliflower and carrot. Eat within 2 days.
- Tilapia | protein | 180 g | Tilapia fillet
- Mashed potato | carb | 200 g | Potatoes
- Cauliflower and carrot | veg | 150 g | Cauliflower 100 g, Carrot 50 g
- Oil | fat | 13.5 g | Cooking oil

Snack: Yogurt cheesecake cup. Greek yogurt and ayib whipped with stevia and vanilla, with papaya and oat crumble. Keeps 3 days.
- Greek yogurt | protein | 150 g | Greek yogurt
- Ayib | protein | 40 g | Ayib
- Papaya | fruit | 80 g | Papaya
- Oats | carb | 10 g | Oats
- Stevia, vanilla | seasoning | to taste | Stevia, Vanilla extract

Every snack has a savory alternative a client can choose instead (counts as a swap): 2 boiled eggs and cucumber with mitmita. Add Cucumber and Mitmita as ingredients for this.

### Starter swap table (seed it; staff can edit)

| From | To | Extra cost |
| --- | --- | --- |
| Beans (chili) | +60 g lean minced beef | Price difference |
| Tilapia | Chicken breast, same grams | 0 |
| Lean beef (any) | Chicken breast, same grams | 0 |
| Chicken breast (any) | Lean beef, same grams | Price difference |
| Injera | Rice, 45 g dry | 0 |
| Rice | Potatoes, 150 g | 0 |
| Feta or mozzarella | Ayib, double grams | 0 |
| Sweet snack | Savory snack (2 boiled eggs, cucumber, mitmita) | 0 |
| Peanut butter | Ayib, 40 g (for nut allergy) | 0 |
| Gomen | Mixed sautéed veg (cabbage and carrot), same grams | 0 |

Paid add-on: extra protein, +50 g of the meal's main protein, priced at ingredient cost × (1 + buffer) ÷ (1 − margin floor), rounded up to the nearest 10 ETB.

Allergies and dislikes on the client record are checked against every meal's ingredients. A conflict without a swap is shown in red on the client page, the packing list and the weekly order review.

</document>

<document index="5" name="ingredients_seed_data">

Prices are intentionally empty: a staff member will fill them in from real market prices. The app must work with missing prices (show "price missing" wherever a cost depends on one, and block publishing a client price until every ingredient in that client's menu has a price).

Nutrition values are per 100 g raw unless marked per piece. They are reasonable reference values for seeding; the nutritionist can edit them.

| Ingredient | Food group (for price buffer) | Purchase unit | kcal | Protein g | Carbs g | Fat g |
| --- | --- | --- | --- | --- | --- | --- |
| Chicken breast | Chicken | kg | 120 | 23 | 0 | 2.6 |
| Lean beef, diced | Beef | kg | 150 | 21 | 0 | 7 |
| Lean minced beef | Beef | kg | 170 | 20 | 0 | 10 |
| Tilapia fillet | Fish | kg | 96 | 20 | 0 | 1.7 |
| Eggs (per piece, about 50 g) | Eggs | piece | 72 | 6.3 | 0.4 | 4.8 |
| Egg white (per white, derived from Eggs) | Eggs | uses 1 egg | 17 | 3.6 | 0.2 | 0 |
| Greek yogurt | Dairy | kg | 97 | 9 | 4 | 5 |
| Ayib | Dairy | kg | 98 | 11 | 3.4 | 4.3 |
| Feta | Dairy | kg | 264 | 14 | 4 | 21 |
| Mozzarella | Dairy | kg | 280 | 22 | 3 | 20 |
| Dry beans | Legumes | kg | 340 | 21 | 62 | 1.2 |
| Oats | Grains | kg | 389 | 17 | 66 | 7 |
| Rice | Grains | kg | 360 | 7 | 80 | 0.6 |
| Pasta | Grains | kg | 371 | 13 | 75 | 1.5 |
| Lasagna sheets | Grains | kg | 371 | 13 | 75 | 1.5 |
| Potatoes | Vegetables | kg | 77 | 2 | 17 | 0.1 |
| Sweet potatoes | Vegetables | kg | 86 | 1.6 | 20 | 0.1 |
| Whole-wheat bread | Grains | kg | 250 | 12 | 42 | 3.5 |
| Whole-wheat tortillas | Grains | kg | 300 | 9 | 50 | 7 |
| Injera (per piece, about 120 g) | Grains | piece | 180 | 6 | 36 | 1.2 |
| Cabbage | Vegetables | kg | 25 | 1.3 | 6 | 0.1 |
| Carrot | Vegetables | kg | 41 | 0.9 | 10 | 0.2 |
| Zucchini | Vegetables | kg | 17 | 1.2 | 3.1 | 0.3 |
| Onion | Vegetables | kg | 40 | 1.1 | 9 | 0.1 |
| Spinach | Vegetables | kg | 23 | 2.9 | 3.6 | 0.4 |
| Tomatoes | Vegetables | kg | 18 | 0.9 | 3.9 | 0.2 |
| Green peppers | Vegetables | kg | 20 | 0.9 | 4.6 | 0.2 |
| Broccoli | Vegetables | kg | 34 | 2.8 | 7 | 0.4 |
| Cauliflower | Vegetables | kg | 25 | 1.9 | 5 | 0.3 |
| Green beans | Vegetables | kg | 31 | 1.8 | 7 | 0.2 |
| Habesha gomen | Vegetables | kg | 33 | 2.7 | 5.7 | 0.7 |
| Cucumber | Vegetables | kg | 15 | 0.7 | 3.6 | 0.1 |
| Banana | Fruit | kg | 89 | 1.1 | 23 | 0.3 |
| Apple | Fruit | kg | 52 | 0.3 | 14 | 0.2 |
| Papaya | Fruit | kg | 43 | 0.5 | 11 | 0.3 |
| Cooking oil | Oil | litre (0.92 kg) | 884 | 0 | 0 | 100 |
| Peanut butter | Other | kg | 588 | 25 | 20 | 50 |
| Unsweetened cocoa | Other | kg | 228 | 20 | 58 | 14 |
| Honey | Other | kg | 304 | 0.3 | 82 | 0 |
| Milk | Dairy | litre | 61 | 3.2 | 4.8 | 3.3 |
| Stevia | Other | kg | 0 | 0 | 0 | 0 |
| Vanilla extract | Other | litre | 0 | 0 | 0 | 0 |
| Cinnamon | Other | kg | 0 | 0 | 0 | 0 |
| Baking powder | Other | kg | 0 | 0 | 0 | 0 |
| Mitmita | Other | kg | 0 | 0 | 0 | 0 |

Seasonings with 0 nutrition are tracked for stock only. Awaze, garlic, lemon, rosemary, mixed herbs, salt and black pepper are used in cooking but are not tracked in this first version; list them on recipe cards as "pantry".

</document>

<document index="6" name="pricing_formula">

This formula already runs in the team's pricing tool and the numbers below are its current defaults. Reproduce it exactly in a pure, unit-tested function.

```
food_day        = sum over the client's menu days of ingredient cost of their profile's portions (plus swaps and add-ons),
                  divided by the number of menu days in the rotation week (7)
buffered_food   = sum over ingredients of cost × (1 + buffer[food_group])
delivery_day    = drops_per_month × drop_cost ÷ service_days_per_month
consult_day     = consult_per_month ÷ service_days_per_month
fixed_day       = fixed_costs_per_month ÷ (capacity_clients × service_days_per_month)
price_day       = (buffered_food_day + delivery_day + consult_day + fixed_day) ÷ (1 − margin_floor)
price_month     = round_to_nearest(price_day × service_days_per_month, 100)
plan_price      = price_month + plan_service_fee[package]          (fee per package, default 0, owner-editable)
first_week_quick_start = price_day × service days left in the current week (rounded to nearest 10)
```

Defaults (all owner-editable in settings, with a change log of who changed what and when):
- Buffer by food group: Chicken 15%, Beef 10%, Fish 10%, Eggs 10%, Dairy 10%, Vegetables 10%, Fruit 10%, Grains 5%, Legumes 5%, Oil 10%, Other 11%.
- Drop cost: 150 ETB. Consult cost: 2,200 ETB per client per month. Fixed costs: 38,000 ETB per month. Capacity for spreading fixed costs: 12 clients. Margin floor: 10%. Service days per month: 26. Rounding: nearest 100 ETB.
- Delivery options and drops per month: daily, all meals in one drop (standard) 26; three drops a day 78; every 3 days 9; weekly 4.33; pick-up at Adorsi Cafe 0.

For reference only (do not hard-code): with average food costs the team modelled an average client at about 58,400 ETB a month on daily delivery and 54,100 ETB on pick-up.

Prices are locked for four months from the subscription start. A price change applies at the next renewal unless an owner applies it earlier, logged with the reason.

## Packages (defaults, owner-editable)

| Package | Swap limit | Nutritionist check-ins | Coaching | Delivery |
| --- | --- | --- | --- | --- |
| Essential | 3 | Monthly | Community access | Pick-up or daily delivery |
| Performance | 6 | Every 2 weeks | Community plus monthly group Q&A with Dagi and Kidus | Daily delivery included |
| Premium | 10 | Weekly | Community plus monthly 1:1 coaching call | Daily delivery, priority time slot |

Goal (Lean or Build) is a setting inside every package, not a separate product.

</document>

<document index="7" name="community_spec">

Purpose: keep subscribers motivated and accountable, and give Dagi and Kidus a direct channel to them. It is a small private group (tens to low hundreds of people), not a social network.

Who can do what:
- Active subscribers can read, post, comment, react, join challenges and rate meals. Paused subscribers can read and react only. Ended subscribers lose access 14 days after their plan ends.
- Coaches (Dagi, Kidus) post announcements, pin posts, run challenges and answer Q&A. Their posts carry a "Coach" badge.
- Operations and owners moderate: hide a post or comment (with reason), mute a member for a set time, review reports.
- Members show as first name plus last initial and an optional avatar. Phone numbers and addresses never appear in the community.

Features:
1. Feed: text posts with up to 4 photos (compressed client-side to at most 1,600 px on the long edge). Newest first, pinned posts on top. Paginated, light on data.
2. Comments and reactions: one reaction type set (like, fire, strong). Comments one level deep.
3. Progress posts: a post type that can attach a weight change from the member's own check-ins ("−3.2 kg in 4 weeks"), only if the member ticks "share this".
4. Weekly challenges: a coach creates a challenge with a title, dates and a daily check-in question (for example "Did you hit 8,000 steps?"). Members tap yes once per day; the app shows streaks and a simple leaderboard by days completed. No prizes logic.
5. Q&A: a post type "Question for the coaches"; coaches can mark one reply as the answer.
6. Meal ratings: on the client's "today" screen, rate each meal 1 to 5 with an optional comment. Ratings feed the owners' dashboard (average per meal over the last 4 weeks) and are not public by default.
7. Reports and moderation: any member can report a post or comment; reports go to an ops queue and a staff Telegram alert.
8. Notifications: in-app and, if opted in, Telegram for replies to your post, coach announcements and challenge reminders. Daily digest at most; no spam.

</document>

<document index="8" name="notifications_and_schedules">

Scheduled jobs (all times Africa/Addis_Ababa). Implement them as idempotent API routes protected by a secret, triggered by Railway cron services calling the route. Running a job twice must not double-lock, double-charge or double-notify.

| When | Job |
| --- | --- |
| Tuesday 10:00 | Reminder to every active client: changes and payment due by Thursday 18:00 |
| Thursday 16:00 | Last-call reminder to clients with unpaid invoices |
| Thursday 18:00 | Lock next week's orders; generate invoices for the following period where needed; send ops a summary (locked, skipped for non-payment, paused) |
| Friday 08:00 | Build the shopping list for next week; send ops the link |
| Daily 18:00 | Lock quick starts for the next service day; update the next morning's top-up purchase list; send kitchen and ops the counts |
| Daily 06:00 | Send kitchen the production sheet link and riders their route link |
| Sunday 17:00 | Reminder to kitchen to complete the stock count |
| Daily 09:00 | Renewal reminders 5 days and 1 day before a plan ends; check-in reminders on each client's check-in day |

Telegram: one bot. Staff link their Telegram by tapping a deep link that carries a one-time token. Clients can opt in the same way from their profile. If the bot token is not configured, notifications fall back to in-app only and the app keeps working.

</document>

</project_documents>
