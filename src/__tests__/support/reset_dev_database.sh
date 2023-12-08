# get current pwd where reset_dev_database.sh is located
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
file="$DIR/reset_dev_database.sql"

psql postgres://postgres:password@localhost:5432/skill-tests <$file
