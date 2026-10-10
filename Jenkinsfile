// Jenkins CI/CD for sotto-web (ADR 0023 in sotto-platform; setup guide linked there).
// Runs on the sotto-jenkins EC2 server, which has Node 24 (pnpm via Corepack), Docker with Buildx
// and the AWS CLI configured for the jenkins user.
//   Every branch and PR: install, lint, format, typecheck, unit tests, production build.
//   main only: build the arm64 web image, push it to ECR, deploy it to the demo.
// Playwright, Storybook and the accounts end-to-end job stay in GitHub Actions' ci.yml.
// ECR_REGISTRY is a Jenkins global environment variable.

pipeline {
  agent any

  options {
    timeout(time: 30, unit: 'MINUTES')
    disableConcurrentBuilds() // one build per branch; every deploy targets the same demo server
  }

  environment {
    AWS_REGION = 'eu-west-2'
    COREPACK_ENABLE_DOWNLOAD_PROMPT = '0' // let Corepack fetch the pinned pnpm without asking
    NEXT_TELEMETRY_DISABLED = '1'
  }

  stages {
    stage('Install') {
      steps { sh 'pnpm install --frozen-lockfile' }
    }

    stage('Lint and typecheck') {
      steps {
        sh 'pnpm lint'
        sh 'pnpm format:check'
        sh 'pnpm typecheck'
      }
    }

    stage('Test') {
      steps { sh 'pnpm test' }
    }

    stage('Build') {
      steps { sh 'pnpm build' }
    }

    stage('Build and push image') {
      when { branch 'main' }
      steps {
        script { env.TAG = "sha-${env.GIT_COMMIT.take(7)}" }
        // arm64 for the Graviton demo server; same tags as images.yml: sha-<7> plus main.
        sh '''
          aws ecr get-login-password | docker login --username AWS --password-stdin $ECR_REGISTRY
          docker buildx build --platform linux/arm64 --build-arg APP_VERSION=$TAG \
            -t $ECR_REGISTRY/sotto/web:$TAG -t $ECR_REGISTRY/sotto/web:main --push .
        '''
      }
    }

    stage('Deploy to demo') {
      when { branch 'main' }
      steps {
        // The demo has no SSH port: deploys run its deploy.sh through the sotto-deploy SSM
        // document, exactly as images.yml did.
        sh '''
          ID=$(aws ssm send-command --document-name sotto-deploy \
            --targets "Key=tag:sotto-role,Values=demo" \
            --parameters "services=web,tag=$TAG" \
            --comment "sotto-web $TAG (jenkins)" \
            --query Command.CommandId --output text)
          echo "Deploy command: $ID"
          for i in $(seq 1 60); do
            STATUS=$(aws ssm list-commands --command-id $ID --query 'Commands[0].Status' --output text)
            echo "status: $STATUS"
            [ "$STATUS" = "Success" ] && exit 0
            case "$STATUS" in
              Failed|Cancelled|TimedOut)
                aws ssm list-command-invocations --command-id $ID --details \
                  --query 'CommandInvocations[0].CommandPlugins[0].Output' --output text
                exit 1 ;;
            esac
            sleep 10
          done
          exit 1
        '''
      }
    }
  }

  post {
    always { cleanWs() }
  }
}
