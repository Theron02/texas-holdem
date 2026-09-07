# ---------- 빌드 단계: 클라이언트를 컴파일한다 ----------
FROM node:22-slim AS builder
WORKDIR /app

# 락파일과 워크스페이스 매니페스트만 먼저 복사하면
# 소스가 바뀌어도 의존성 레이어는 캐시된다
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci

COPY shared/ shared/
COPY server/ server/
COPY client/ client/
RUN npm run build

# ---------- 실행 단계 ----------
FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
# 실행에 필요한 것만. tsx가 dependencies에 있어서 여기 포함된다.
RUN npm ci --omit=dev && npm cache clean --force

# 서버는 tsx로 소스를 직접 실행한다 (README의 "설계 문서와 달라진 점" 참고)
COPY shared/ shared/
COPY server/src/ server/src/
COPY --from=builder /app/client/dist client/dist

EXPOSE 3001
CMD ["npm", "start", "-w", "server"]
