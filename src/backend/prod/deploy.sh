#!/bin/bash
# Uploads a local directory to an AWS Lambda function

# --- Configuration & Colors ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# --- Step 1: Check AWS Login ---
aws sts get-caller-identity &> /dev/null
if [ $? -ne 0 ]; then
    echo -e "${RED}AWS credentials not found. Please run 'aws configure' first.${NC}"
    exit 1
fi

# --- Step 2: Validate Arguments ---
if [ -z "$1" ]; then
    echo -e "${RED}Usage: ./deploy.sh <awsFunctionName>${NC}"
    echo "Example: ./deploy.sh processURL (will zip the process_url directory)"
    exit 2
fi

# --- Step 3: Identify Directory and Function Name ---
AWS_FUNCTION_NAME=$1

# Smart conversion: camelCase/acronyms to snake_case
# processURL -> process_url, getS3Object -> get_s3_object
# dirnames are in snake_case, and func names are in camelCase
DIR_NAME=$(echo "$AWS_FUNCTION_NAME" | perl -pe 's/([a-z0-9])([A-Z])/$1_$2/g; s/([A-Z]+)([A-Z][a-z])/$1_$2/g; $_=lc($_)')
ZIP_NAME="${AWS_FUNCTION_NAME}.zip"

echo -e "${YELLOW}--- 🚀 Starting Deployment for $AWS_FUNCTION_NAME ---${NC}"

if [ ! -d "$DIR_NAME" ]; then
    echo -e "${RED}❌ Error: Local directory '$DIR_NAME' not found.${NC}"
    exit 3
fi

# --- Step 4: Zip Directory Contents ---
echo -e "${YELLOW}📦 Packaging code from $DIR_NAME...${NC}"
rm -f "$ZIP_NAME"   # Remove old zip if exists
cd "$DIR_NAME" || exit 4

# Zip contents excluding sensitive files, pre-installed SDKs, etc.
zip -qr "../$ZIP_NAME" . \
    -x "*.git*" \
    -x "test_input.js" \
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
    exit 5
fi

cd ..

# --- Step 5: Verify Zip Contents ---
echo -e "${YELLOW}🔍 Verifying package contents...${NC}"
FORBIDDEN_FILES=$(unzip -l "$ZIP_NAME" | \
    grep -v "node_modules" | \
    grep -E ".env|service_account.json|service-account.json|private|aws-sdk|package-lock.json|test_input.js")

if [ ! -z "$FORBIDDEN_FILES" ]; then
    echo -e "${RED}⚠️  WARNING: Forbidden files found in zip!${NC}"
    echo "$FORBIDDEN_FILES"
    echo -e "${RED}Aborting deployment for safety.${NC}"
    rm "../$ZIP_NAME"
    exit 6
fi
echo -e "${GREEN}✅ No secrets or SDKs detected in package.${NC}"

# --- Step 6: Upload to AWS Lambda ---
echo -e "${YELLOW}☁️  Uploading to Lambda...${NC}"
UPLOAD_OUTPUT=$(aws lambda update-function-code \
    --function-name "$AWS_FUNCTION_NAME" \
    --zip-file "fileb://$ZIP_NAME" 2>&1)

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Error: AWS upload failed!${NC}"
    echo -e "$UPLOAD_OUTPUT"
    rm "$ZIP_NAME"
    exit 7
fi

echo -e "${GREEN}✅ Upload successful!${NC}"

# --- Wait for the update to finish propagating ---
echo -e "${YELLOW}⏳ Waiting for function update to complete...${NC}"
PROPAGATION_OUTPUT=$(aws lambda wait function-updated --function-name "$AWS_FUNCTION_NAME" 2>&1)

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Error: Propagation failed!${NC}"
    echo -e "$PROPAGATION_OUTPUT"
    rm "$ZIP_NAME"
    exit 8
fi

echo -e "${GREEN}✅ Propagation successful!${NC}"

# --- Step 7: Smoke Test (Invoke) ---
echo -e "${YELLOW}🧪 Running smoke test...${NC}"
aws lambda invoke \
    --function-name "$AWS_FUNCTION_NAME" \
    --payload "$(node $DIR_NAME/test_input.js)" \
    --cli-binary-format raw-in-base64-out \
    response.json > /dev/null

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Test triggered successfully.${NC}"
    echo -e "${YELLOW}📄 Function response:${NC}"
    cat response.json
    echo -e ""
else
    echo -e "${RED}❌ Smoke test failed.${NC}"
    echo -e "${YELLOW}🔍 Fetching last 10 log events from CloudWatch...${NC}"
    
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
    
    exit 9
fi

# --- Step 8: Final Cleanup ---
echo -e "${YELLOW}🧹 Cleaning up temporary files...${NC}"
rm -f "$ZIP_NAME" response.json
echo -e "${GREEN}--- ✨ Deployment complete ---${NC}"
