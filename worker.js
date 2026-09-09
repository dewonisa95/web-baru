export class SensorState {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);

    // =====================================================
    // GET /api/sensor
    // Website mengambil data sensor terakhir
    // =====================================================
    if (request.method === "GET" && url.pathname === "/api/sensor") {
      const data = await this.ctx.storage.get("sensorData");

      if (!data) {
        return jsonResponse({
          db: 0,
          warning: false,
          buzzer: true,
          device: null,
          timestamp: null,
          status: "waiting"
        });
      }

      return jsonResponse(data);
    }

    // =====================================================
    // POST /api/sensor
    // ESP32 mengirim data sensor
    // =====================================================
    if (request.method === "POST" && url.pathname === "/api/sensor") {
      try {
        const body = await request.json();

        // Validasi sederhana
        if (!body.device || !Array.isArray(body.readings)) {
          return jsonResponse(
            {
              success: false,
              error: "Format data tidak valid"
            },
            400
          );
        }

        if (body.readings.length === 0) {
          return jsonResponse(
            {
              success: false,
              error: "Readings kosong"
            },
            400
          );
        }

        const reading = body.readings[body.readings.length - 1];

        const sensorData = {
          db: Number(reading.db) || 0,
          warning: reading.warning === true,
          buzzer: reading.buzzer !== false,
          device: body.device,
          timestamp: reading.t || new Date().toISOString()
        };

        // Simpan data terakhir
        await this.ctx.storage.put(
          "sensorData",
          sensorData
        );

        return jsonResponse({
          success: true,
          message: "Data sensor diterima",
          buzzer: sensorData.buzzer
        });
      } catch (error) {
        return jsonResponse(
          {
            success: false,
            error: "JSON tidak valid"
          },
          400
        );
      }
    }

    return jsonResponse(
      {
        error: "Endpoint tidak ditemukan"
      },
      404
    );
  }
}


// =====================================================
// WORKER UTAMA
// =====================================================
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // ===================================================
    // API SENSOR
    // ===================================================
    if (
      url.pathname === "/api/sensor"
    ) {
      const id = env.SENSOR_STATE.idFromName(
        "esp-sound-01"
      );

      const stub =
        env.SENSOR_STATE.get(id);

      return stub.fetch(request);
    }


    // ===================================================
    // API BUZZER
    // ===================================================
    if (
      url.pathname === "/buzzer"
    ) {
      return handleBuzzer(request, env);
    }


    // ===================================================
    // ROUTE LAIN → STATIC ASSETS
    // ===================================================
    return env.ASSETS.fetch(request);
  }
};


// =====================================================
// KONTROL BUZZER
// =====================================================
async function handleBuzzer(request, env) {

  const url =
    new URL(request.url);

  const state =
    url.searchParams.get("state");

  if (
    state !== "on" &&
    state !== "off"
  ) {
    return jsonResponse(
      {
        success: false,
        error: "Parameter state harus on atau off"
      },
      400
    );
  }


  const id =
    env.SENSOR_STATE.idFromName(
      "esp-sound-01"
    );

  const stub =
    env.SENSOR_STATE.get(id);


  const current =
    await stub.fetch(
      new Request(
        "https://internal/api/sensor"
      )
    );


  let data =
    await current.json();


  data.buzzer =
    state === "on";


  // Simpan perubahan
  // menggunakan endpoint internal sederhana
  const saveResponse =
    await stub.fetch(
      new Request(
        "https://internal/set-buzzer",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json"
          },
          body: JSON.stringify({
            buzzer:
              state === "on"
          })
        }
      )
    );


  if (!saveResponse.ok) {
    return jsonResponse(
      {
        success: false,
        error: "Gagal menyimpan status buzzer"
      },
      500
    );
  }


  return jsonResponse({
    success: true,
    buzzer:
      state === "on"
  });
}


// =====================================================
// JSON RESPONSE
// =====================================================
function jsonResponse(
  data,
  status = 200
) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        "Content-Type":
          "application/json",
        "Cache-Control":
          "no-store"
      }
    }
  );
}
