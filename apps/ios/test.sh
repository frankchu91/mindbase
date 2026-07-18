#!/bin/bash
set -e
cd "$(dirname "$0")"
xcodegen generate
xcodebuild test \
  -project MindBase.xcodeproj \
  -scheme MindBase \
  -sdk iphonesimulator \
  -destination 'platform=iOS Simulator,name=iPhone 16' \
  -only-testing:MindBaseUITests \
  CODE_SIGN_IDENTITY="" CODE_SIGNING_REQUIRED=NO CODE_SIGNING_ALLOWED=NO
