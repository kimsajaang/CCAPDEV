# Sample Profiles - Backlog Hero

These sample profiles are created when you run `npm run seed`. They are defined in [model/seed.js](model/seed.js).

## Sample Users

| Username | Email | Password | Display Name |
|----------|-------|----------|--------------|
| gaminglead | joshua@backlog-hero.local | password123 | Kane Joshua |
| speedrunner99 | justin@backlog-hero.local | password123 | Justin Ice |
| casualplayer | seanne@backlog-hero.local | password123 | Seanne Fortea |
| indiegames | alex@backlog-hero.local | password123 | Alex Chen |
| competitiveking | mike@backlog-hero.local | password123 | Mike Rodriguez |

## How to Seed the Database

1. Ensure MongoDB is connected
2. Run: `npm run seed`
3. You can now login with any of the sample credentials above

## Default Password

All sample profiles use: **password123**

## Location

- **File**: [model/seed.js](model/seed.js)
- **Sample Users Section**: Lines 19-61
- **Sample Games Section**: Lines 63+
- **Sample Library Entries Section**: Further down in the file

## Profile Details

Each profile includes:
- **Username** - For login
- **Email** - Contact email
- **Password** - Default password123
- **Display Name** - Public name on site
- **Bio** - User biography
- **Avatar** - Generated avatar image
- **Favorite Games** - List of favorite games
