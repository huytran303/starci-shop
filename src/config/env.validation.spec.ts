import { EnvValidationError, validateEnv } from './env.validation';

/** Bộ env tối thiểu hợp lệ — mỗi test chỉ làm hỏng đúng một biến từ đây. */
const validEnv = (): Record<string, unknown> => ({
  NODE_ENV: 'test',
  PORT: '3000',
  DATABASE_URL: 'postgres://user:pass@localhost:5432/starci_shop',
  JWT_SECRET: 'x'.repeat(32),
});

describe('validateEnv — ĐẢM BẢO 1: config sai thì không boot', () => {
  it('thiếu DATABASE_URL → ném lỗi có nêu đúng tên biến', () => {
    const env = validEnv();
    delete env.DATABASE_URL;

    expect(() => validateEnv(env)).toThrow(EnvValidationError);
    expect(() => validateEnv(env)).toThrow(/DATABASE_URL/);
  });

  it('JWT_SECRET quá ngắn → chặn ngay, không đợi tới lúc ký token', () => {
    expect(() => validateEnv({ ...validEnv(), JWT_SECRET: 'ngan' })).toThrow(/JWT_SECRET/);
  });

  it('PORT không phải số → chặn, thay vì để app listen trên rác', () => {
    expect(() => validateEnv({ ...validEnv(), PORT: 'abc' })).toThrow(/PORT/);
  });

  it('báo TẤT CẢ lỗi một lượt, không dừng ở lỗi đầu tiên', () => {
    const env = validEnv();
    delete env.DATABASE_URL;
    delete env.JWT_SECRET;

    // Sửa một vòng là xong, thay vì boot-sửa-boot-sửa từng biến một.
    expect(() => validateEnv(env)).toThrow(/DATABASE_URL[\s\S]*JWT_SECRET/);
  });
});

describe('validateEnv — kết quả trả về', () => {
  it('PORT được coerce thành number thật, không phải chuỗi "3000"', () => {
    const env = validateEnv(validEnv());

    expect(env.PORT).toBe(3000);
    expect(typeof env.PORT).toBe('number');
  });

  it('điền default cho biến không bắt buộc', () => {
    const env = validateEnv(validEnv());

    expect(env.HOST).toBe('0.0.0.0');
    expect(env.API_PREFIX).toBe('api');
    expect(env.LOG_LEVEL).toBe('info');
  });

  it('object trả về bị đông cứng — không code nào mutate config lúc runtime', () => {
    const env = validateEnv(validEnv());

    expect(Object.isFrozen(env)).toBe(true);
  });
});
