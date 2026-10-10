pipeline {
  agent any

  options {
    timeout(time: 30, unit: 'MINUTES')
    disableConcurrentBuilds()
  }

  environment {
    AWS_REGION = 'eu-west-2'
    COREPACK_ENABLE_DOWNLOAD_PROMPT = '0'
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
    always { cleanWs() }
  }
}
