#!/bin/bash

echo "🚀 Testing New Central Accounts Payment System"
echo "=============================================="

# Test 1: Account Funding (CHARGE)
echo ""
echo "📊 Test 1: Account Funding via Credit Card (CHARGE)"
echo "----------------------------------------------------"
curl -X POST "http://localhost:3000/accounts/YOUR_ACCOUNT_ID/fund" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 100.00,
    "currency": "GHS",
    "paymentMethod": "CREDIT_CARD",
    "provider": "VISA"
  }' | jq '.'

echo ""
echo "📊 Test 2: Account Funding via Bank Account (CHARGE)"
echo "-----------------------------------------------------"
curl -X POST "http://localhost:3000/accounts/YOUR_ACCOUNT_ID/fund" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 150.00,
    "currency": "GHS",
    "paymentMethod": "BANK_ACCOUNT",
    "provider": "GCB"
  }' | jq '.'

echo ""
echo "📊 Test 3: Send Money via MTN Mobile Money (TRANSFER)"
echo "------------------------------------------------------"
curl -X POST "http://localhost:3000/remittance/send" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -H "idempotency-key: test-remit-mtn-001" \
  -d '{
    "receiverDetails": {
      "firstName": "John",
      "lastName": "Doe",
      "email": "john@example.com",
      "phoneNumber": "+233241234567",
      "country": "GH",
      "accountNumber": "241234567",
      "bankCode": "MTN"
    },
    "amount": 50.00,
    "currency": "GHS",
    "paymentProvider": "MTN"
  }' | jq '.'

echo ""
echo "📊 Test 4: Send Money via Bank Transfer (TRANSFER)"
echo "---------------------------------------------------"
curl -X POST "http://localhost:3000/remittance/send" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -H "idempotency-key: test-remit-bank-001" \
  -d '{
    "receiverDetails": {
      "firstName": "Jane",
      "lastName": "Smith", 
      "email": "jane@example.com",
      "phoneNumber": "+233241234568",
      "country": "GH",
      "accountNumber": "1234567890",
      "bankCode": "GCB"
    },
    "amount": 75.00,
    "currency": "GHS",
    "paymentProvider": "GCB"
  }' | jq '.'

echo ""
echo "📊 Test 5: Get Supported Banks/Mobile Money Providers"
echo "-----------------------------------------------------"
# This would be a new endpoint you might want to add
# curl -X GET "http://localhost:3000/payment/supported-banks" \
#   -H "Authorization: Bearer YOUR_JWT_TOKEN" | jq '.'

echo ""
echo "✅ Test completed!"
echo "Expected behavior:"
echo "- Funding requests (Test 1 & 2) should trigger CHARGE events → charge.success/failed webhooks"
echo "- Remittance requests (Test 3 & 4) should trigger TRANSFER events → transfer.success/failed webhooks"
echo "- Webhooks should be processed by central-accounts provider in WebhookController"
echo "- Account balances should update for funding, remittance statuses should update for transfers"
