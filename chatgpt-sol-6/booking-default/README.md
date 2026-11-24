# Appointment Booking

A single-container appointment booking app using Node.js 24, Express 5, and SQLite. Users can create accounts, log in, view available slots, book one, and view or cancel their own bookings. An admin can see all bookings and add or remove unbooked slots.

## Folder structure

```text
chatgpt-sol-6/booking-default/
├── .dockerignore
├── .env.example
├── .gitignore
├── Dockerfile
├── README.md
├── dist/
│   ├── SHA256SUMS.txt
│   ├── README.txt
│   └── appointment-booking-image-multiarch.tar.gz
├── package-lock.json
├── package.json
├── public/
│   ├── app.js
│   ├── index.html
│   └── styles.css
├── src/
│   ├── db.js
│   ├── security.js
│   └── server.js
└── test/
    └── server.test.js
```

## Run with Docker

From this folder, copy `.env.example` to `.env` and replace `ADMIN_PASSWORD` with a unique password of at least 12 characters. Then run:

```sh
docker build -t appointment-booking .
docker run --name appointment-booking -p 3000:3000 \
  --env-file .env -e COOKIE_SECURE=false \
  -v appointment_booking_data:/data appointment-booking
```

Open <http://localhost:3000>. Log in with the admin email and password from `.env`. Other users can sign up on the page. The named Docker volume keeps the database across container restarts. For local HTTP, `COOKIE_SECURE=false` allows the browser to send the session cookie. If port 3000 is already occupied, stop the other service first.

## Run the prebuilt image without source code

Share the file `dist/appointment-booking-image-multiarch.tar.gz`. It contains Linux AMD64 and ARM64 images, so Docker selects the recipient's platform. The recipient only needs Docker and an admin environment file; no project source, Node.js installation, or build step is needed.

Create `booking.env` beside the downloaded archive with these two lines, replacing the password with a unique value of at least 12 characters:

```text
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=replace-with-a-long-unique-password
```

Then run from the directory containing the archive:

```sh
docker load -i appointment-booking-image-multiarch.tar.gz
docker run --name appointment-booking -p 3000:3000 \
  --env-file booking.env -e COOKIE_SECURE=false \
  -v appointment_booking_data:/data appointment-booking:1.0.0
```

Open <http://localhost:3000>. The archive checksum is in `dist/SHA256SUMS.txt`. Keep `booking.env` private. The image contains the app but no user database or credentials.

The admin credentials create the admin account only if it does not already exist. Changing `ADMIN_PASSWORD` later does not rotate the stored password. Protect `.env` and the Docker volume.

## Production notes

Use HTTPS in front of the container and omit `COOKIE_SECURE=false`. Keep `/data` on a persistent volume and back it up. Run one container per SQLite database. The container runs as a non-root user. Slots are stored in UTC and displayed in each viewer's local time. A booked slot cannot be removed until its booking is cancelled; cancelled bookings remain in history.

## Development

```sh
npm ci
npm test
npm start
```

The app listens on port 3000 by default. Local data is stored in `data/appointments.db`; set `DATA_DIR` to change it. Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` in the environment to create an admin. `PORT` can override the local port, but the Docker image is configured for port 3000.
