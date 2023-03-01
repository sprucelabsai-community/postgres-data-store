# Postgres Setup

## Setup

You will need to install jsonb support!

```sh
brew install postgresql@14-jsonb
psql
CREATE EXTENSION IF NOT EXISTS "jsonb";
```