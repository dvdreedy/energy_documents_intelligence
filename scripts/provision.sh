#!/usr/bin/env bash
set -euo pipefail

APP="energydocs"
ENV="dev"
LOC="eastus2"
SEARCH_LOC="centralus" # Free Search tier was out of capacity in eastus2

[[ -f .env ]] && source .env
: "${AZURE_SUBSCRIPTION_ID:?Add AZURE_SUBSCRIPTION_ID to .env first}"
az account set --subscription "$AZURE_SUBSCRIPTION_ID"

az account show --query "{subscription:name, id:id, tenant:tenantDisplayName, domain:tenantDefaultDomain}" -o table
read -rp "Deploy here? (y/N) " ANSWER
[[ "$ANSWER" == "y" ]] || { echo "Stopped."; exit 1; }

TOKEN=$(az account show --query id -o tsv | sha256sum | cut -c1-6)
RG="rg-$APP-$ENV"
DI="di-$APP-$ENV-$TOKEN"
SEARCH="srch-$APP-$ENV-$TOKEN"
echo "Creating: $RG, $DI, $SEARCH"

az provider register --namespace Microsoft.CognitiveServices --wait
az provider register --namespace Microsoft.Search --wait

az group create -n "$RG" -l "$LOC"

az cognitiveservices account create -n "$DI" -g "$RG" -l "$LOC" \
  --kind FormRecognizer --sku S0 --custom-domain "$DI" --yes

az search service create -n "$SEARCH" -g "$RG" -l "$SEARCH_LOC" --sku free \
  --auth-options aadOrApiKey --aad-auth-failure-mode http401WithBearerChallenge

ME=$(az ad signed-in-user show --query id -o tsv)
DI_ID=$(az cognitiveservices account show -n "$DI" -g "$RG" --query id -o tsv)
SEARCH_ID=$(az search service show -n "$SEARCH" -g "$RG" --query id -o tsv)

az role assignment create --assignee-object-id "$ME" --assignee-principal-type User \
  --role "Cognitive Services User" --scope "$DI_ID"
az role assignment create --assignee-object-id "$ME" --assignee-principal-type User \
  --role "Search Service Contributor" --scope "$SEARCH_ID"
az role assignment create --assignee-object-id "$ME" --assignee-principal-type User \
  --role "Search Index Data Contributor" --scope "$SEARCH_ID"

echo ""
echo "Paste into .env:"
echo "AZURE_DOCINTEL_ENDPOINT=https://$DI.cognitiveservices.azure.com/"
echo "AZURE_SEARCH_ENDPOINT=https://$SEARCH.search.windows.net"