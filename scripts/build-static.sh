#!/bin/sh
set -eu

project_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
output_dir="$project_dir/dist"

mkdir -p "$output_dir/data"
find "$output_dir" -type f -delete
cp "$project_dir/index.html" "$project_dir/guide.html" "$project_dir/styles.css" "$project_dir/app.js" "$project_dir/payroll.js" "$project_dir/importers.js" "$output_dir/"
cp "$project_dir/data/tax-table-2026.js" "$output_dir/data/"

echo "정적 배포 파일 생성: $output_dir"
