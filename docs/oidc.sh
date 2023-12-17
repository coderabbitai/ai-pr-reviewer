set -euo pipefail

PROJECT_ID=$(gcloud config get-value project)
SERVICE_ACCOUNT_NAME="github-action"
SERVICE_ACCOUNT="${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
WORKLOAD_IDENTITY_POOL="github-pool"
WORKLOAD_IDENTITY_PROVIDER="github-provider"
GIT_USER=$(git config user.name)
REPO=$(git remote get-url origin | perl -pe 's/.git$//' | perl -pe 's;.+/([^/]+/[^/]);$1;')

echo "PROJECT_ID=${PROJECT_ID}
SERVICE_ACCOUNT_NAME=${SERVICE_ACCOUNT_NAME}
SERVICE_ACCOUNT=${SERVICE_ACCOUNT}
WORKLOAD_IDENTITY_POOL=${WORKLOAD_IDENTITY_POOL}
WORKLOAD_IDENTITY_PROVIDER=${WORKLOAD_IDENTITY_PROVIDER}
GIT_USER=${GIT_USER}
REPO=${REPO}"

gcloud iam service-accounts create "${SERVICE_ACCOUNT_NAME}" \
  --project "${PROJECT_ID}"

gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --role="roles/aiplatform.user" \
  --member="serviceAccount:${SERVICE_ACCOUNT}"

gcloud iam workload-identity-pools create "${WORKLOAD_IDENTITY_POOL}" \
  --project="${PROJECT_ID}" \
  --location="global" \
  --display-name="GitHub Actions Pool"

WORKLOAD_IDENTITY_POOL_ID=$(gcloud iam workload-identity-pools describe "${WORKLOAD_IDENTITY_POOL}" \
  --project="${PROJECT_ID}" \
  --location="global" \
  --format="value(name)")

echo "WORKLOAD_IDENTITY_POOL_ID=${WORKLOAD_IDENTITY_POOL_ID}"

gcloud iam workload-identity-pools providers create-oidc "${WORKLOAD_IDENTITY_PROVIDER}" \
  --project="${PROJECT_ID}" \
  --location="global" \
  --workload-identity-pool="${WORKLOAD_IDENTITY_POOL}" \
  --display-name="My GitHub repo Provider" \
  --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository,attribute.repository_owner=assertion.repository_owner" \
  --attribute-condition="attribute.repository_owner=='${GIT_USER}'" \
  --issuer-uri="https://token.actions.githubusercontent.com"

gcloud iam workload-identity-pools providers describe "${WORKLOAD_IDENTITY_PROVIDER}" \
  --project="${PROJECT_ID}" \
  --location="global" \
  --workload-identity-pool="${WORKLOAD_IDENTITY_POOL}" \
  --format="value(name)"

gcloud iam service-accounts add-iam-policy-binding "${SERVICE_ACCOUNT}" \
  --project="${PROJECT_ID}" \
  --role="roles/iam.workloadIdentityUser" \
  --member="principalSet://iam.googleapis.com/${WORKLOAD_IDENTITY_POOL_ID}/attribute.repository/${REPO}"
