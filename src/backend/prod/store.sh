#!/bin/bash
# Uploads a folder to an S3 bucket only uploading JSON files, gotten by running JS files

OPTIONS=b:
LONGOPTS=bucket:,dryrun

PARSED_ARGS=$(getopt -o $OPTIONS --long $LONGOPTS -- "$@")

if [ $? -ne 0 ] || [ -z "$1" ]; then
    echo "Usage: $0 --bucket <bucket_name> <file_path>"
    exit 1
fi

eval set -- "$PARSED_ARGS"

while true; do
    case "$1" in
        -b|--bucket)
            BUCKET_NAME=$2
            shift 2
            ;;
        --dryrun)
            DRYRUN="--dryrun"
            shift
            ;;
        --)
            shift
            break
            ;;
        *)
            echo "Internal error: $1"
            exit 1
            ;;
    esac
done

if [ -z "$BUCKET_NAME" ]; then
    echo "⚠️ Error: Bucket name not provided"
    exit 2
fi

if [ ! -d "$1" ]; then
    echo "⚠️ Error: Directory not found"
    exit 3
fi

# Create JSON files by running JS files
for file in "$1"/*.js "$1"/**/*.js; do
    if [ -f "$file" ]; then
        filename="${file%.js}.json"
        node "$file" > "$filename"
        echo "$filename" >> store.log
    fi
done

aws s3 sync "$1" s3://"$BUCKET_NAME"/"$1" --exclude "*" --include "*.json" $DRYRUN

# Clean up
while read -r line; do
    rm "$line"
done < store.log

rm store.log
