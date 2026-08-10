# 008 — Viết Docker cho MongoDB

**Ngày:** 2026-08-03
**Từ khoá:** docker, docker-compose, mongodb, volume, authSource, replica set, image, tag, registry, docker pull, layer, namespace, cgroup, compass

## Câu hỏi

> hướng dẫn tôi cách viết docker cho 1 mongodb

## Trả lời

### Không cần Dockerfile

Dockerfile dùng để **build** image. MongoDB đã có image chính thức trên Docker
Hub, ta chỉ **chạy** nó. Chỉ viết Dockerfile khi cần nhét thêm thứ gì vào image
(rất hiếm với database). Vậy nên chỉ cần `docker-compose.yml`.

### File `docker-compose.yml`

```yaml
services:
  mongo:
    image: mongo:8
    restart: unless-stopped
    environment:
      MONGO_INITDB_ROOT_USERNAME: ${MONGO_USER:-root}
      MONGO_INITDB_ROOT_PASSWORD: ${MONGO_PASSWORD:-secret}
      MONGO_INITDB_DATABASE: starci
    ports:
      - "27017:27017"
    volumes:
      - mongo-data:/data/db

volumes:
  mongo-data:
```

Biến môi trường tương ứng trong `.env` / `.env.example`:

```
MONGO_USER=root
MONGO_PASSWORD=secret
MONGODB_URI=mongodb://root:secret@localhost:27017/starci?authSource=admin
```

### Giải thích từng phần

| Dòng | Vì sao |
|---|---|
| `image: mongo:8` | Pin major version. Dùng `latest` thì một ngày `docker pull` sẽ kéo về major mới và app gãy. |
| `restart: unless-stopped` | Máy reboot thì container tự lên lại, trừ khi ta chủ động `docker compose down`. |
| `MONGO_INITDB_ROOT_*` | Chỉ có tác dụng **lần chạy đầu tiên**, khi volume còn rỗng. Đổi password sau đó không ăn thua — phải `down -v` hoặc đổi trong mongo shell. |
| `MONGO_INITDB_DATABASE` | Tạo sẵn db `starci`. Thực ra Mongo tự tạo db khi ghi document đầu tiên; dòng này chỉ để rõ ý đồ. |
| `volumes: mongo-data:/data/db` | **Bắt buộc.** Không có nó thì `docker compose down` là mất sạch dữ liệu. Named volume do Docker quản lý, không làm bẩn thư mục project. |
| `authSource=admin` trong URI | Root user nằm ở db `admin`, không phải `starci`. Thiếu tham số này là nguyên nhân lỗi auth phổ biến nhất. |

### Lệnh thường dùng

```bash
docker compose up -d          # bật
docker compose logs -f mongo  # xem log
docker compose down           # tắt, giữ data
docker compose down -v        # tắt và xoá luôn volume (mất data)
```

### Những thứ cố tình chưa thêm

- **`healthcheck`** — chỉ cần khi có service app trong cùng compose dùng
  `depends_on: condition: service_healthy`. Chạy mỗi Mongo thì thừa.
- **Replica set** — chỉ cần khi dùng **transactions** hoặc **change streams**.
  Dấu hiệu nhận biết: Mongoose báo
  `Transaction numbers are only allowed on a replica set member`.
  Lúc đó mới cấu hình, không phải ngay từ đầu.
- **`mongo-express`** (UI trong browser) — dùng MongoDB Compass ở máy host là đủ,
  khỏi tốn thêm một container.
- **`container_name`, `networks`** — Compose tự đặt tên và tự tạo network mặc định.

---

## Câu hỏi tiếp theo

> sao viết như này là docker biết cần tải xuống mongo vậy, cái `mongo:8` là
> tương tự câu lệnh gì ở host

`mongo:8` là **tên image**, không phải tên phần mềm. Docker không "biết MongoDB
là gì" — nó chỉ biết đi tìm một cái tên trên registry.

### Tên đầy đủ

`mongo:8` là dạng viết tắt. Tên đầy đủ Docker tự điền vào:

```
docker.io/library/mongo:8
└──┬───┘ └──┬──┘ └─┬─┘ └┬┘
registry  namespace repo tag
```

| Thành phần | Ý nghĩa |
|---|---|
| `docker.io` | Registry mặc định (Docker Hub). Ghi `ghcr.io/foo/bar` thì lấy từ GitHub Container Registry. |
| `library` | Namespace mặc định cho **official images**. Mongo là image chính thức nên không có prefix user. So sánh: `bitnami/mongodb` là image của Bitnami, phải ghi đủ `bitnami/`. |
| `mongo` | Tên repository. |
| `8` | Tag. Không ghi thì mặc định là `:latest`. |

### Lệnh tương đương ở host

Compose block trong bài này gần đúng bằng:

```bash
docker run -d \
  --name starci-shop-mongo-1 \
  --restart unless-stopped \
  -e MONGO_INITDB_ROOT_USERNAME=root \
  -e MONGO_INITDB_ROOT_PASSWORD=secret \
  -e MONGO_INITDB_DATABASE=starci \
  -p 27017:27017 \
  -v starci-shop_mongo-data:/data/db \
  mongo:8
```

Riêng phần "tải xuống" tương đương:

```bash
docker pull mongo:8
```

Nhưng **không cần chạy `pull` thủ công**. `docker run` / `docker compose up` tự
làm: nếu image chưa có trong local store thì pull trước rồi mới chạy. Đó là lý do
lần đầu `up -d` thấy màn hình đầy thanh progress tải các layer, lần thứ hai chạy
tức thì.

### Xem cái đã tải

```bash
docker images                 # danh sách image đang có ở local
docker image inspect mongo:8  # metadata: layer, entrypoint, env, port
```

### Vì sao Mongo chạy được mà không cần cấu hình gì

Image đã đóng gói sẵn:

- binary `mongod` cùng toàn bộ OS layer cần thiết
- `ENTRYPOINT` / `CMD` trỏ vào `mongod` → container start là DB chạy
- một entrypoint script đọc các biến `MONGO_INITDB_*` để tạo user lần đầu

Nói cách khác, người bảo trì image đã viết Dockerfile hộ rồi. Ta chỉ đang tiêu
thụ kết quả — đúng như phần đầu bài đã nói: không cần tự viết Dockerfile.

### Cái bẫy của tag

Tag **không bất biến**. `mongo:8` hôm nay là 8.0.4, ba tháng sau `docker pull`
lại có thể ra 8.0.9. Muốn khoá cứng thì pin sâu hơn (`mongo:8.0.4`) hoặc pin theo
digest:

```yaml
image: mongo@sha256:abc123...
```

Digest bất biến tuyệt đối. Với DB dev thì `mongo:8` là đủ — đánh đổi giữa "không
bao giờ bất ngờ" và "không phải sửa file mỗi lần có bản vá bảo mật".

---

## Câu hỏi tiếp theo

> thế làm sao docker đóng gói được mongodb nhỉ, như ở máy host thì phải cài
> mongodb về, xong tải compass về để tạo connection, thì ở bên docker làm như
> thế nào

Cốt lõi: **Docker không "cài" MongoDB, nó đóng gói sẵn kết quả của việc cài.**

### Ở host, cài Mongo gồm những gì

```bash
brew install mongodb-community   # 1. tải binary + thư viện phụ thuộc
                                 # 2. đặt vào /opt/homebrew/...
                                 # 3. tạo thư mục data /opt/homebrew/var/mongodb
brew services start mongodb      # 4. chạy tiến trình mongod
```

Bốn bước. Bước 1–3 tạo ra **một tập file trên đĩa**. Bước 4 chạy **một tiến trình**.

### Docker tách đôi hai thứ đó

| Khái niệm | Là gì | Tương ứng ở host |
|---|---|---|
| **Image** | Tập file đã cài xong, đóng băng lại, read-only | Kết quả của bước 1–3 |
| **Container** | Tiến trình `mongod` đang chạy, nhìn thấy tập file đó | Bước 4 |

Người bảo trì MongoDB chạy bước 1–3 **một lần** trên máy họ, chụp lại toàn bộ
filesystem, đẩy lên Docker Hub. Ta `docker pull` là tải về ảnh chụp đó — không có
"quá trình cài đặt" nào diễn ra trên máy mình.

Đó là lý do `docker pull` hiện nhiều dòng progress song song — mỗi dòng là một
**layer**, một lát cắt filesystem:

```
Pulling from library/mongo
a1b2c3: Pull complete   ← Ubuntu base
d4e5f6: Pull complete   ← apt install các thư viện
g7h8i9: Pull complete   ← binary mongod
```

### Container chạy trên OS nào

Đây là chỗ hay nhầm. Container **không phải máy ảo**. Không có OS nào khởi động
bên trong.

```
┌─────────────────────────────────────┐
│  Tiến trình mongod                  │  ← container
│  nhìn thấy: filesystem của image    │
│  bị giới hạn bởi: namespace, cgroup │
├─────────────────────────────────────┤
│  Linux kernel (chung)               │  ← của host
├─────────────────────────────────────┤
│  Phần cứng                          │
└─────────────────────────────────────┘
```

`mongod` là một tiến trình bình thường trên host, chỉ khác ở chỗ kernel nói dối nó:

- **mount namespace** → nó thấy `/` là filesystem của image, không phải `/` của ta
- **PID namespace** → nó nghĩ mình là PID 1, không thấy tiến trình nào khác
- **network namespace** → nó có IP riêng, `localhost` của nó là chính nó
- **cgroup** → giới hạn RAM/CPU nó được dùng

Cái "Ubuntu" trong image chỉ là các thư mục `/usr`, `/lib`, `/etc` — thư viện
userspace. Không kernel, không systemd, không init. Vì thế container khởi động
trong mili giây còn VM mất mấy chục giây.

> Trên macOS, Docker Desktop chạy một VM Linux nhỏ ở giữa vì macOS không có Linux
> kernel. Container vẫn nằm trong VM đó, nguyên lý không đổi.

### Compass thì sao

**Vẫn cài ở host như bình thường.** Compass là GUI client, không liên quan đến
server.

```
Compass (app trên macOS)
   │
   │  mongodb://root:secret@localhost:27017/?authSource=admin
   ↓
localhost:27017 (máy host)
   │  ← đây là tác dụng của dòng  ports: - "27017:27017"
   ↓
container mongo, cổng 27017
```

Dòng `ports:` trong compose là cây cầu duy nhất. Bỏ nó đi thì Mongo vẫn chạy
ngon, nhưng Compass không nối vào được — container nằm trong network riêng.

Với Compass, Mongo trong Docker và Mongo cài bằng brew **không phân biệt được**:
cùng protocol, cùng cổng.

### Vào bên trong container

```bash
docker compose exec mongo mongosh -u root -p secret   # mongo shell
docker compose exec mongo bash                        # shell của container
```

`exec` = chạy thêm một tiến trình trong cùng bộ namespace. Vào rồi gõ `ls /` sẽ
thấy filesystem Ubuntu, `ps aux` chỉ thấy `mongod`. Đó là ảo giác do namespace
tạo ra.

### Được gì so với cài ở host

| | Host | Docker |
|---|---|---|
| Gỡ sạch | `brew uninstall` + xoá tay data, config, log rải rác | `docker compose down -v` |
| Hai project cần Mongo 6 và Mongo 8 | Đau đầu | Hai compose file, xong |
| Đồng nghiệp dựng lại môi trường | Đọc README làm theo 10 bước | `docker compose up -d` |
| Xung đột thư viện hệ thống | Có thể | Không, mỗi container có `/usr` riêng |

Đánh đổi: tốn thêm ~500MB đĩa cho image, và trên macOS có lớp VM nên I/O chậm hơn
native đôi chút. Với DB dev thì không đáng kể.

---

### Khi app cũng chạy trong Docker

Service app kết nối bằng **tên service** làm hostname, không phải `localhost`:

```
mongodb://root:secret@mongo:27017/starci?authSource=admin
```

Lý do: mỗi container có network namespace riêng, `localhost` bên trong container
app là chính nó chứ không phải máy host. Docker Compose tạo một network chung và
resolve tên service thành IP của container.

Khi đó khối `ports:` của mongo có thể bỏ đi nếu không cần truy cập từ máy host —
bớt một cổng mở ra ngoài.
