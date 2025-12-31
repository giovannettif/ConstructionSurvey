#!/bin/bash

# --- Configuration & Colors ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# --- Step 0: Validate Input ---
if [ -z "$1" ]; then
    echo -e "${RED}Usage: ./deploy.sh <awsFunctionName>${NC}"
    echo "Example: ./deploy.sh processURL (will zip the process_url directory)"
    exit 1
fi

AWS_FUNCTION_NAME=$1

# Smart conversion: camelCase/acronyms to snake_case
# processURL -> process_url, getS3Object -> get_s3_object
DIR_NAME=$(echo "$AWS_FUNCTION_NAME" | perl -pe 's/([a-z0-9])([A-Z])/$1_$2/g; s/([A-Z]+)([A-Z][a-z])/$1_$2/g; $_=lc($_)')
ZIP_NAME="${AWS_FUNCTION_NAME}.zip"

echo -e "${YELLOW}--- 🚀 Starting Deployment for $AWS_FUNCTION_NAME ---${NC}"

# --- Step 1: Verify Directory Presence ---
if [ ! -d "$DIR_NAME" ]; then
    echo -e "${RED}❌ Error: Local directory '$DIR_NAME' not found.${NC}"
    exit 1
fi

# --- Step 2: Cleanup and Packaging ---
echo -e "${YELLOW}📦 Packaging code from $DIR_NAME...${NC}"
rm -f "$ZIP_NAME"

# Zip contents excluding sensitive files and pre-installed SDKs
cd "$DIR_NAME" || exit
zip -qr "../$ZIP_NAME" . \
    -x "*.git*" \
    -x "test/*" \
    -x "**/.env" \
    -x "**/service_account.json" "**/service-account.json" \
    -x "package-lock.json" \
    -x "private/*" "**/private/*" \
    -x "node_modules/aws-sdk/*" \
    -x "node_modules/@aws-sdk/*" \
    -x "node_modules/.bin/*"

# Check if zip was successful
if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Error: Failed to create zip file.${NC}"
    exit 1
fi
cd ..

# --- Step 2.5: Verify Package Content ---
echo -e "${YELLOW}🔍 Verifying package contents...${NC}"
FORBIDDEN_FILES=$(unzip -l "$ZIP_NAME" | grep -v "node_modules" | grep -E ".env|service_account.json|service-account.json|private|aws-sdk|package-lock.json")

if [ ! -z "$FORBIDDEN_FILES" ]; then
    echo -e "${RED}⚠️  WARNING: Forbidden files found in zip!${NC}"
    echo "$FORBIDDEN_FILES"
    echo -e "${RED}Aborting deployment for safety.${NC}"
    rm "../$ZIP_NAME"
    exit 1
fi
echo -e "${GREEN}✅ No secrets or SDKs detected in package.${NC}"

# --- Step 3: AWS CLI Upload ---
echo -e "${YELLOW}☁️  Uploading to Lambda...${NC}"
UPLOAD_OUTPUT=$(aws lambda update-function-code \
    --function-name "$AWS_FUNCTION_NAME" \
    --zip-file "fileb://$ZIP_NAME" 2>&1)

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Error: AWS Upload Failed!${NC}"
    echo -e "$UPLOAD_OUTPUT"
    rm "$ZIP_NAME"
    exit 1
fi
echo -e "${GREEN}✅ Upload Successful!${NC}"

# --- Step 4: Smoke Test (Invoke) ---
echo -e "${YELLOW}🧪 Running Smoke Test (Invocaton)...${NC}"
aws lambda invoke \
    --function-name "$AWS_FUNCTION_NAME" \
    --payload '{}' \
    --cli-binary-format raw-in-base64-out \
    response.json > /dev/null

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Test Triggered Successfully.${NC}"
    echo -e "${YELLOW}📄 Function Response:${NC}"
    cat response.json
    echo -e ""
else
    echo -e "${RED}❌ Smoke Test Failed.${NC}"
    echo -e "${YELLOW}🔍 Fetching last 5 log events from CloudWatch...${NC}"
    
    # Get the latest log stream name
    STREAM=$(aws logs describe-log-streams \
        --log-group-name "/aws/lambda/$AWS_FUNCTION_NAME" \
        --order-by LastEventTime --descending --limit 1 \
        --query 'logStreams[0].logStreamName' --output text)

    # Print the last 10 lines of that stream
    aws logs get-log-events \
        --log-group-name "/aws/lambda/$AWS_FUNCTION_NAME" \
        --log-stream-name "$STREAM" \
        --limit 10 --query 'events[*].message' --output text
    
    exit 1
fi

# --- Final Cleanup ---
rm -f "$ZIP_NAME" response.json
echo -e "${GREEN}--- ✨ Deployment Complete ---${NC}"