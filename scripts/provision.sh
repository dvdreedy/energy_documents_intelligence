#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.." # run from the repo root, wherever the script is called from

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
AIF="aif-$APP-$ENV-$TOKEN"
PROJ="proj-$APP-$ENV"
CHAT_MODEL="gpt-5-mini"
EMBED_MODEL="text-embedding-3-small"
echo "Creating: $RG, $DI, $SEARCH, $AIF, $PROJ"

az provider register --namespace Microsoft.CognitiveServices --wait
az provider register --namespace Microsoft.Search --wait

az group create -n "$RG" -l "$LOC"

# Document Intelligence
az cognitiveservices account create -n "$DI" -g "$RG" -l "$LOC" \
  --kind FormRecognizer --sku S0 --custom-domain "$DI" --yes

# AI Search
az search service create -n "$SEARCH" -g "$RG" -l "$SEARCH_LOC" --sku free \
  --auth-options aadOrApiKey --aad-auth-failure-mode http401WithBearerChallenge

# Foundry resource, project, and model deployments
az cognitiveservices account create -n "$AIF" -g "$RG" -l "$LOC" \
  --kind AIServices --sku S0 --custom-domain "$AIF" \
  --assign-identity --allow-project-management true

az cognitiveservices account project create -n "$AIF" -g "$RG" \
  --project-name "$PROJ" -l "$LOC"

az cognitiveservices account deployment create -n "$AIF" -g "$RG" \
  --deployment-name "$CHAT_MODEL" --model-name "$CHAT_MODEL" --model-version "2025-08-07" \
  --model-format OpenAI --sku-name GlobalStandard --sku-capacity 10

az cognitiveservices account deployment create -n "$AIF" -g "$RG" \
  --deployment-name "$EMBED_MODEL" --model-name "$EMBED_MODEL" --model-version "1" \
  --model-format OpenAI --sku-name GlobalStandard --sku-capacity 120

# Data-plane roles for the signed-in user (no API keys anywhere)
ME=$(az ad signed-in-user show --query id -o tsv)
DI_ID=$(az cognitiveservices account show -n "$DI" -g "$RG" --query id -o tsv)
SEARCH_ID=$(az search service show -n "$SEARCH" -g "$RG" --query id -o tsv)
AIF_ID=$(az cognitiveservices account show -n "$AIF" -g "$RG" --query id -o tsv)

az role assignment create --assignee-object-id "$ME" --assignee-principal-type User \
  --role "Cognitive Services User" --scope "$DI_ID"
az role assignment create --assignee-object-id "$ME" --assignee-principal-type User \
  --role "Search Service Contributor" --scope "$SEARCH_ID"
az role assignment create --assignee-object-id "$ME" --assignee-principal-type User \
  --role "Search Index Data Contributor" --scope "$SEARCH_ID"
# Foundry User (formerly Azure AI User), referenced by ID because the name changed
az role assignment create --assignee-object-id "$ME" --assignee-principal-type User \
  --role "53ca6127-db72-4b80-b1b0-d745d6d5456d" --scope "$AIF_ID"

echo ""
echo "Paste into .env:"
echo "AZURE_DOCINTEL_ENDPOINT=https://$DI.cognitiveservices.azure.com/"
echo "AZURE_SEARCH_ENDPOINT=https://$SEARCH.search.windows.net"
echo "AZURE_OPENAI_ENDPOINT=https://$AIF.openai.azure.com/"
echo "AZURE_OPENAI_CHAT_DEPLOYMENT=$CHAT_MODEL"
echo "AZURE_OPENAI_EMBEDDING_DEPLOYMENT=$EMBED_MODEL"