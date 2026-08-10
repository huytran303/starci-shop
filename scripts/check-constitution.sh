#!/usr/bin/env bash
# Máy kiểm cho .sdd/constitution.md (gate L3). Vi phạm là fail CI.
#
# Ranh giới tầng (ARCH-01) do ESLint ép — `pnpm lint` mới là check chính; file
# này chỉ gom những check mà lint và tsc không làm được. Các grep lọc bỏ dòng
# comment (` * `, `//`) vì doc trong repo hay nhắc tới chính thứ bị cấm.
set -euo pipefail
cd "$(dirname "$0")/.."
fail=0

violation() {
  echo "❌ $1"
  fail=1
}

# Bỏ dòng comment khỏi output grep -rn (định dạng file:line:content)
strip_comments() {
  grep -vE ':[0-9]+:\s*(\*|//|/\*)' || true
}

# SEC-04: process.env (và bypass process["env"]) chỉ trong src/server/config/
hits=$(grep -rnE 'process(\.env|\[)' src/server --include='*.ts' | grep -v '^src/server/config/' | strip_comments || true)
if [ -n "$hits" ]; then
  echo "$hits"
  violation 'SEC-04: process.env ngoài src/server/config/'
fi

# SEC-04: .env phải bị git ignore
if ! grep -qxF '.env' .gitignore; then
  violation 'SEC-04: .gitignore không ignore .env'
fi

# SEC-03: SQL nối bằng template literal — chỉ chấp nhận tham số hoá ($1, $2)
if grep -rnE '\.(query|execute)\s*\(\s*`' src/server --include='*.ts'; then
  violation 'SEC-03: SQL viết bằng template literal — dùng tham số hoá ($1)'
fi

# SEC-03: ValidationPipe global phải được mount (anchor đầu dòng — comment không tính)
if ! grep -qE '^\s*app\.useGlobalPipes\(' src/server/app.setup.ts; then
  violation 'SEC-03: useGlobalPipes không được mount trong app.setup.ts'
fi

# SEC-03/ARCH-01: driver Postgres chỉ trong tầng data
hits=$(grep -rnE "from '(pg|postgres)'" src/server --include='*.ts' | grep -vE '^src/server/(database/|modules/[^/]+/data/)' | strip_comments || true)
if [ -n "$hits" ]; then
  echo "$hits"
  violation 'ARCH-01: driver Postgres import ngoài tầng data'
fi

# ARCH-01: console.* chỉ ở hai đường boot-fatal (còn lại inject AppLogger)
hits=$(grep -rnE 'console\.[a-z]+\(' src/server --include='*.ts' | grep -vE '^src/server/(main\.ts|config/env\.validation\.ts)' | strip_comments || true)
if [ -n "$hits" ]; then
  echo "$hits"
  violation 'ARCH-01: console.* ngoài main.ts / config/env.validation.ts — dùng AppLogger'
fi

# LOG-01: middleware requestId mount bằng app.use() cho MỌI route
if ! grep -qE '^\s*app\.use\(.*requestId' src/server/app.setup.ts; then
  violation 'LOG-01: middleware requestId không mount trong app.setup.ts'
fi

# STD-01: strict ghim trong tsconfig (parse bằng chính TypeScript — file là
# JSONC có comment, require() không đọc được)
if ! node -e "const ts = require('typescript'); const c = ts.readConfigFile('./tsconfig.json', ts.sys.readFile).config; process.exit(c.compilerOptions.strict === true ? 0 : 1)"; then
  violation 'STD-01: tsconfig.json không ghim "strict": true'
fi

if [ "$fail" -eq 0 ]; then
  echo '✅ constitution ok'
fi
exit "$fail"
