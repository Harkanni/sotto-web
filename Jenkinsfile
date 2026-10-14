// Sotto web: every check that used to run in GitHub Actions' ci.yml, now on Jenkins (ADR on
// Jenkins in sotto-platform), plus the image push and demo deploy on main. Independent stages
// run side by side, so a many-core host finishes much sooner.
//
// AWS access comes from the jenkins user's AWS CLI profile (~jenkins/.aws, set with
// `sudo -u jenkins aws configure`); the ECR registry is worked out from the account.
//
// The Jenkins host needs Docker (with buildx), Node 24 with corepack, Python 3 (Storybook's
// static server), the AWS CLI, the "Lockable Resources" plugin, and once, as root, Playwright's
// system libraries: `sudo npx -y playwright@1 install-deps chromium`. The browser itself is
// downloaded per user and cached (~/.cache/ms-playwright).

/** The api's containers for the accounts flow: removed before and after. */
def stopAccountsStack() {
  sh '''
    for c in sotto-ci-web-api sotto-ci-web-pg sotto-ci-web-redis sotto-ci-web-mq sotto-ci-web-s3 \
      sotto-ci-web-mail sotto-ci-web-smoke; do
      docker rm -f $c >/dev/null 2>&1 || true
    done
  '''
}

/**
 * The api image for the accounts flow, tagged sotto-api:accounts. From ECR when the demo's
 * repositories exist (sotto/api:main, or ACCOUNTS_API_TAG); otherwise built from sotto-api's
 * main, because `terraform destroy` removes ECR too and the checks must not depend on the demo.
 */
def prepareApiImage() {
  def rc = sh(returnStatus: true, script: '''
    out=$(aws ecr describe-repositories --repository-names sotto/api 2>&1) || {
      echo "$out" | grep -q RepositoryNotFoundException && exit 3; echo "$out"; exit 1; }
    ECR_REGISTRY="${ECR_REGISTRY:-$(aws sts get-caller-identity --query Account --output text).dkr.ecr.$AWS_REGION.amazonaws.com}"
    aws ecr get-login-password | docker login --username AWS --password-stdin $ECR_REGISTRY
    docker pull --quiet "$ECR_REGISTRY/sotto/api:${ACCOUNTS_API_TAG:-main}" || exit 3
    docker tag "$ECR_REGISTRY/sotto/api:${ACCOUNTS_API_TAG:-main}" sotto-api:accounts
  ''')
  if (rc == 0) { return }
  if (rc != 3) { error("Couldn't reach ECR (exit ${rc}); see above.") }
  echo 'No api image in ECR (the demo is down): building sotto-api main from source.'
  dir("${env.WORKSPACE}@api-src") {
    git url: 'https://github.com/Harkanni/sotto-api.git', branch: 'main',
      credentialsId: scm.userRemoteConfigs[0].credentialsId
    sh 'docker build --build-arg APP=api -t sotto-api:accounts .'
  }
}

/**
 * Whether there's a demo to deploy to. `terraform destroy` removes everything, the image
 * repositories included, so while it's down main skips the push and the deploy (they don't
 * fail); after `terraform apply`, Build main once and both run.
 */
def demoIsUp() {
  if (env.DEMO_UP == null) {
    // 0: up. 3: down. Anything else (say, missing AWS permissions) fails the build rather than
    // quietly skipping the deploy.
    def rc = sh(returnStatus: true, script: '''
      out=$(aws ecr describe-repositories --repository-names sotto/web 2>&1) || {
        echo "$out" | grep -q RepositoryNotFoundException && exit 3; echo "$out"; exit 1; }
      n=$(aws ec2 describe-instances --filters Name=tag:sotto-role,Values=demo \\
        Name=instance-state-name,Values=running --query 'length(Reservations)' --output text) || exit 1
      [ "$n" != 0 ] || exit 3
    ''')
    if (rc != 0 && rc != 3) { error("Couldn't check the demo with AWS (exit ${rc}); see above.") }
    env.DEMO_UP = rc == 0 ? 'true' : 'false'
    if (rc == 3) {
      echo 'The demo is down (no ECR repository or running demo server): skipping push and deploy.'
    }
  }
  return env.DEMO_UP == 'true'
}

pipeline {
  agent any

  options {
    timeout(time: 60, unit: 'MINUTES')
    // A newer push to the same branch or PR stops the older build: nobody needs its result.
    disableConcurrentBuilds(abortPrevious: true)
    // The api and web pipelines share the host's ports (3000, 4000, 5432…): one at a time.
    lock(resource: 'sotto-ci-host')
    buildDiscarder(logRotator(numToKeepStr: '30'))
  }

  environment {
    AWS_REGION = 'eu-west-2'
    COREPACK_ENABLE_DOWNLOAD_PROMPT = '0'
    NEXT_TELEMETRY_DISABLED = '1'
    // Playwright: one retry and terse output, as on CI.
    CI = 'true'
  }

  stages {
    // Side by side: the secrets scan, the code checks and build, and the two images (this app's,
    // and the api's for the accounts flow).
    stage('Checks and images') {
      parallel {
        stage('Secrets scan') {
          steps {
            sh 'docker run --rm -v "$PWD:/repo" ghcr.io/gitleaks/gitleaks:latest dir /repo --redact --verbose'
          }
        }

        stage('Code') {
          stages {
            stage('Install') {
              steps {
                sh '''
                  pnpm install --frozen-lockfile
                  pnpm exec playwright install chromium
                '''
              }
            }
            // Lint, format, typecheck and unit tests at once; each prints its own block. Build
            // comes after: typecheck's `next typegen` and the build both write .next.
            stage('Lint, typecheck, test') {
              steps {
                sh '''
                  mkdir -p .ci
                  run() { name=$1; shift; ( "$@" > ".ci/$name.log" 2>&1; echo $? > ".ci/$name.rc" ) & }
                  run lint pnpm lint
                  run format pnpm format:check
                  run typecheck pnpm typecheck
                  run test pnpm test
                  wait
                  failed=""
                  for n in lint format typecheck test; do
                    echo "===== $n (exit $(cat .ci/$n.rc))"; cat ".ci/$n.log"
                    [ "$(cat .ci/$n.rc)" = 0 ] || failed="$failed $n"
                  done
                  [ -z "$failed" ] || { echo "Failed:$failed"; exit 1; }
                '''
              }
            }
            stage('Build') {
              steps {
                sh 'pnpm build'
                sh 'pnpm build-storybook --quiet'
              }
            }
          }
        }

        // Built once, with the release's version baked in; the Jenkins host is arm64 like the
        // demo, so on main this same image is tagged and pushed.
        stage('Images') {
          steps {
            script { env.TAG = "sha-${env.GIT_COMMIT.take(7)}" }
            sh 'docker build --build-arg APP_VERSION=$TAG -t sotto-web:ci .'
            script { prepareApiImage() }
          }
        }
      }
    }

    // iPhone and desktop, axe and 44 px targets, against the production build with no API (the
    // app must show its "unreachable" states, not crash); and every story renders cleanly and
    // passes axe, in light and dark; and the image's smoke test. Different ports (3000, 6006,
    // 3100) and output folders.
    stage('Browser tests') {
      parallel {
        stage('End-to-end') {
          steps { sh 'pnpm e2e' }
          post {
            failure {
              archiveArtifacts allowEmptyArchive: true, artifacts: 'test-results/**'
            }
          }
        }
        // The image boots and serves /healthz and /status with no API behind it (port 3100, so
        // it runs beside the end-to-end tests on 3000).
        stage('Smoke') {
          steps {
            sh '''
              docker run -d --name sotto-ci-web-smoke -p 3100:3000 -e API_URL=http://127.0.0.1:9 sotto-web:ci
              for i in $(seq 1 30); do
                if curl -fsS localhost:3100/healthz && curl -fsS localhost:3100/status | grep -q 'Building in the open'; then exit 0; fi
                sleep 2
              done
              docker logs sotto-ci-web-smoke; exit 1
            '''
          }
          post { always { sh 'docker rm -f sotto-ci-web-smoke >/dev/null 2>&1 || true' } }
        }

        stage('Stories') {
          steps { sh 'pnpm test:stories --output=stories-results' }
          post {
            failure {
              archiveArtifacts allowEmptyArchive: true, artifacts: 'stories-results/**'
            }
          }
        }
      }
    }

    // Phase 3's done-when flow against the real API: sign up, create a workspace with sample
    // content, invite, accept by email, role-restricted access, on iPhone and desktop. The API
    // is sotto-api's main (from ECR when the demo is up, else built from source; API PRs merge
    // first). Set the environment variable ACCOUNTS_API_TAG to pin another ECR tag.
    stage('Accounts flow') {
      environment {
        DATABASE_URL = 'postgresql://sotto:sotto@localhost:5432/sotto'
      }
      steps {
        script { stopAccountsStack() }
        sh '''
          API_IMAGE=sotto-api:accounts
          docker run -d --name sotto-ci-web-pg -p 5432:5432 -e POSTGRES_USER=sotto \
            -e POSTGRES_PASSWORD=sotto -e POSTGRES_DB=sotto pgvector/pgvector:pg18
          docker run -d --name sotto-ci-web-redis -p 6379:6379 redis:8-alpine
          docker run -d --name sotto-ci-web-mail -p 1025:1025 -p 8025:8025 axllent/mailpit:latest
          docker run -d --name sotto-ci-web-mq -p 5672:5672 -e RABBITMQ_DEFAULT_USER=sotto \
            -e RABBITMQ_DEFAULT_PASS=sotto rabbitmq:4-alpine
          docker run -d --name sotto-ci-web-s3 -p 8333:8333 chrislusf/seaweedfs:latest \
            server -dir=/data -s3 -s3.port=8333
          for i in $(seq 1 60); do
            docker exec sotto-ci-web-pg pg_isready -U sotto -d sotto >/dev/null 2>&1 \
              && docker exec sotto-ci-web-mq rabbitmq-diagnostics -q ping >/dev/null 2>&1 \
              && [ "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:8333/)" != "000" ] && break
            sleep 2
          done
          curl -s -X PUT -o /dev/null -w "bucket: %{http_code}\\n" http://localhost:8333/sotto-files
          docker run --rm --network host -e DATABASE_URL "$API_IMAGE" sh scripts/migrate.sh
          docker run -d --name sotto-ci-web-api --network host \
            -e DATABASE_URL -e REDIS_URL=redis://localhost:6379 -e PORT=4000 \
            -e APP_URL=http://localhost:3000 -e AUTH_SECRET="$(openssl rand -hex 32)" \
            -e AUTH_RATE_LIMIT=off -e SMTP_URL=smtp://localhost:1025 \
            -e RABBITMQ_URL=amqp://sotto:sotto@localhost:5672 \
            -e S3_ENDPOINT=http://localhost:8333 -e S3_BUCKET=sotto-files -e S3_FORCE_PATH_STYLE=true \
            -e S3_ACCESS_KEY_ID=ci -e S3_SECRET_ACCESS_KEY=ci "$API_IMAGE"
          for i in $(seq 1 30); do curl -fsS localhost:4000/healthz >/dev/null && break; sleep 2; done
          curl -fsS localhost:4000/api/v1/sign-in-methods >/dev/null
          ACCOUNTS_E2E=1 pnpm exec playwright test e2e/accounts.spec.ts
        '''
      }
      post {
        failure {
          sh 'docker logs --tail 150 sotto-ci-web-api 2>&1 || true'
          archiveArtifacts allowEmptyArchive: true, artifacts: 'playwright-report/**, test-results/**'
        }
        always { script { stopAccountsStack() } }
      }
    }

    stage('Push image') {
      when {
        branch 'main'
        expression { demoIsUp() }
      }
      steps {
        sh '''
          ECR_REGISTRY="${ECR_REGISTRY:-$(aws sts get-caller-identity --query Account --output text).dkr.ecr.$AWS_REGION.amazonaws.com}"
          aws ecr get-login-password | docker login --username AWS --password-stdin $ECR_REGISTRY
          ARCH=$(docker image inspect -f '{{.Architecture}}' sotto-web:ci)
          [ "$ARCH" = arm64 ] || { echo "sotto-web:ci is $ARCH; the demo needs arm64"; exit 1; }
          for t in $TAG main; do
            docker tag sotto-web:ci $ECR_REGISTRY/sotto/web:$t
            docker push --quiet $ECR_REGISTRY/sotto/web:$t
          done
        '''
      }
    }

    stage('Deploy to demo') {
      when {
        branch 'main'
        expression { demoIsUp() }
      }
      steps {
        sh '''
          ID=$(aws ssm send-command --document-name sotto-deploy \
            --targets "Key=tag:sotto-role,Values=demo" \
            --parameters "services=web,tag=$TAG" \
            --query Command.CommandId --output text)
          echo "Deploy command: $ID"
          for i in $(seq 1 60); do
            STATUS=$(aws ssm list-commands --command-id $ID --query 'Commands[0].Status' --output text)
            echo "status: $STATUS"
            [ "$STATUS" = "Success" ] && exit 0
            case "$STATUS" in Failed|Cancelled|TimedOut) exit 1 ;; esac
            sleep 10
          done
          exit 1
        '''
      }
    }
  }

  post {
    always {
      script { stopAccountsStack() }
      cleanWs()
    }
  }
}
