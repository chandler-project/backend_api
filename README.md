# Chandler API

## Basic

- Chandler API được xây dựng dựa trên nền tảng NodeJS và sử dụng một số thư viện hỗ trợ để xác thực và kết nối với database sử dụng Mongodb. 

- Chạy tốt trên các version mới nhất ( LTS )

## Initial setup

- Đầu tiên chạy lệnh `npm install` để cài đặt những package cần thiết
Thiết lập một số thuộc tính trước khi chạy api:
`server/config.json`
`
{
"host": "0.0.0.0",
"port": 3000,
}
`
- Thiét lâp host và port của API

`server/datasources.json`
`{
    "mongodb": {
        "host": "127.0.0.1",
        "port": 27017,
    },
}
`
- thiết lập host và port của mongodb

- Kiểm tra nếu chưa có thư mục `server/images/chandler` thì tạo thư mục theo đường dẫn đó để lưu ảnh


## Development setup

- Sau khi đã thực hiện xong bước 1, chạy lệnh `npm start` để start server

## Deploy

- Để deploy chỉ cần dùng một số thư viện và làm theo hướng dẫn của thư viện đó để chạy ngầm như 1 service của hệ điều hành như là `pm2`, `nohup` , ...

- Ở đây e dùng `pm2` 

### PM2
- Để cài đặt PM2 chạy câu lệnh : `npm install -g pm2`

- Để chạy api: `pm2 start npm -- start`
- Để kiểm tra api có chạy chưa: `pm2 logs`
- Để restart server : `pm2 restart npm`

