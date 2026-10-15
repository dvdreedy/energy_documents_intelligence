#!/usr/bin/env bash
APP="energydocs"
ENV="dev"
LOC="eastus2"
SEARCH_LOC="$LOC"

# Short, repeatable, anonymous tag generated from your subscription ID
TOKEN=$(az account show --query id -o tsv | sha256sum | cut -c1-6)

RG="rg-$APP-$ENV"
DI="di-$APP-$ENV-$TOKEN"
SEARCH="srch-$APP-$ENV-$TOKEN"

echo "Creating: $RG, $DI, $SEARCH"

az group create -n "$RG" -l "$LOC"

# Document Intelligence (S0: the free tier only reads the first 2 pages)
az cognitiveservices account create -n "$DI" -g "$RG" -l "$LOC" \
  --kind FormRecognizer --sku S0 --custom-domain "$DI" --yes

# AI Search on the free tier, with Entra ID sign-in allowed
az search service create -n "$SEARCH" -g "$RG" -l "$LOC" --sku free \
  --auth-options aadOrApiKey --aad-auth-failure-mode http401WithBearerChallenge

# Give yourself data access (keyless)
ME=$(az ad signed-in-user show --query id -o tsv)
DI_ID=$(az cognitiveservices account show -n "$DI" -g "$RG" --query id -o tsv)
SEARCH_ID=$(az search service show -n "$SEARCH" -g "$RG" --query id -o tsv)

az role assignment create --assignee "$ME" --role "Cognitive Services User" --scope "$DI_ID"
az role assignment create --assignee "$ME" --role "Search Service Contributor" --scope "$SEARCH_ID"
az role assignment create --assignee "$ME" --role "Search Index Data Contributor" --scope "$SEARCH_ID"

echo ""
echo "AZURE_DOCINTEL_ENDPOINT=https://$DI.cognitiveservices.azure.com/"
echo "AZURE_SEARCH_ENDPOINT=https://$SEARCH.search.windows.net"