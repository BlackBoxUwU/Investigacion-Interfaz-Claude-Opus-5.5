"""
Servidor de desarrollo para la interfaz web (solo biblioteca estándar de Python).

Sirve la carpeta ``frontend/`` como archivos estáticos con respaldo SPA
(cualquier ruta que no sea un archivo devuelve ``index.html``) y atiende
``/api/...`` de una de dos formas:

  * Proxy hacia el backend real (por defecto http://localhost:8000):
        python herramientas/servidor_dev.py
        python herramientas/servidor_dev.py --backend http://localhost:8000

  * API simulada en memoria que imita el contrato de openapi.json
    (útil para probar la interfaz sin Docker ni PostgreSQL):
        python herramientas/servidor_dev.py --simulado

Después abre http://localhost:5500 en el navegador.
No modifica el backend ni la base de datos.
"""

import argparse
import json
import mimetypes
import os
import re
import sys
import urllib.error
import urllib.request
import uuid
from datetime import date, datetime, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlsplit

RAIZ = Path(os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "frontend")))

mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("image/svg+xml", ".svg")
mimetypes.add_type("text/css", ".css")


# ---------------------------------------------------------------------------
# API simulada
# ---------------------------------------------------------------------------

TIPOS = ["desktop", "laptop", "monitor", "impresora", "servidor", "otro"]
ESTADOS = ["activo", "en_reparacion", "baja", "almacen"]

CAMPOS_TEXTO = {
    # nombre: (min_length, max_length, obligatorio_en_creacion)
    "numero_inventario": (1, 100, True),
    "marca": (1, 100, True),
    "modelo": (1, 150, True),
    "numero_serie": (1, 200, True),
    "procesador": (0, 200, False),
    "almacenamiento": (0, 200, False),
    "sistema_operativo": (0, 150, False),
    "laboratorio": (1, 150, True),
    "ubicacion": (0, 200, False),
    "responsable": (0, 200, False),
    "observaciones": (0, None, False),
}


class Simulador:
    def __init__(self):
        self.equipos = {}
        self._sembrar()

    def _sembrar(self):
        ejemplos = [
            ("desktop", "Dell", "OptiPlex 7090", "Intel Core i7-11700", 16, "512GB SSD", "Windows 11 Pro", "activo", "Laboratorio A"),
            ("desktop", "HP", "ProDesk 600 G6", "Intel Core i5-10500", 8, "256GB SSD", "Windows 10 Pro", "activo", "Laboratorio A"),
            ("laptop", "Lenovo", "ThinkPad T14", "AMD Ryzen 7 PRO 5850U", 16, "512GB NVMe", "Ubuntu 22.04", "en_reparacion", "Laboratorio B"),
            ("monitor", "Samsung", "S24R350", None, None, None, None, "activo", "Laboratorio B"),
            ("impresora", "Brother", "HL-L2350DW", None, None, None, None, "almacen", "Laboratorio de Redes"),
            ("servidor", "Dell", "PowerEdge R740", "Intel Xeon Silver 4210", 128, "4TB RAID 5", "Rocky Linux 9", "activo", "Laboratorio de Redes"),
            ("desktop", "Acer", "Veriton X", "Intel Core i3-9100", 4, "1TB HDD", "Windows 10", "baja", "Laboratorio C"),
        ]
        base = datetime.utcnow() - timedelta(days=60)
        n = 0
        for i in range(24):
            t, marca, modelo, cpu, ram, alm, so, estado, lab = ejemplos[i % len(ejemplos)]
            n += 1
            ahora = base + timedelta(days=i * 2, hours=i)
            eid = str(uuid.uuid4())
            self.equipos[eid] = {
                "id": eid,
                "numero_inventario": f"INV-2024-{n:03d}",
                "tipo_equipo": t,
                "marca": marca,
                "modelo": modelo,
                "numero_serie": f"SN-{uuid.uuid4().hex[:10].upper()}",
                "procesador": cpu,
                "ram_gb": ram,
                "almacenamiento": alm,
                "sistema_operativo": so,
                "estado": estado,
                "laboratorio": lab,
                "ubicacion": f"Mesa {i % 10 + 1}, Fila {i % 4 + 1}" if t != "servidor" else "Rack 1",
                "responsable": ["Ing. Juan Pérez", "Mtra. Laura Gómez", None, "Lic. Carlos Ruiz"][i % 4],
                "fecha_adquisicion": (date(2021, 1, 15) + timedelta(days=i * 30)).isoformat(),
                "fecha_ultima_revision": (date(2024, 6, 1) + timedelta(days=i * 7)).isoformat() if i % 3 else None,
                "observaciones": "Equipo con teclado y ratón incluidos." if i % 5 == 0 else None,
                "created_at": ahora.isoformat(),
                "updated_at": ahora.isoformat(),
            }

    # -- validación al estilo de Pydantic v2 -----------------------------------
    @staticmethod
    def _validar(cuerpo, creando):
        errores = []

        def err(campo, tipo, msg, ctx=None, entrada=None):
            e = {"type": tipo, "loc": ["body", campo], "msg": msg, "input": entrada}
            if ctx:
                e["ctx"] = ctx
            errores.append(e)

        if not isinstance(cuerpo, dict):
            return [{"type": "model_attributes_type", "loc": ["body"], "msg": "Input should be a valid dictionary"}], {}

        limpio = {}
        for campo, (minimo, maximo, obligatorio) in CAMPOS_TEXTO.items():
            if campo not in cuerpo:
                if creando and obligatorio:
                    err(campo, "missing", "Field required")
                continue
            v = cuerpo[campo]
            if v is None:
                if creando and obligatorio:
                    err(campo, "string_type", "Input should be a valid string", entrada=v)
                else:
                    limpio[campo] = None
                continue
            if not isinstance(v, str):
                err(campo, "string_type", "Input should be a valid string", entrada=v)
                continue
            if len(v) < minimo:
                err(campo, "string_too_short", f"String should have at least {minimo} character", {"min_length": minimo}, v)
                continue
            if maximo and len(v) > maximo:
                err(campo, "string_too_long", f"String should have at most {maximo} characters", {"max_length": maximo}, v)
                continue
            limpio[campo] = v

        for campo, opciones, defecto in (("tipo_equipo", TIPOS, "desktop"), ("estado", ESTADOS, "activo")):
            if campo in cuerpo and cuerpo[campo] is not None:
                if cuerpo[campo] not in opciones:
                    err(campo, "enum", "Input should be " + ", ".join(repr(o) for o in opciones),
                        {"expected": ", ".join(opciones)}, cuerpo[campo])
                else:
                    limpio[campo] = cuerpo[campo]
            elif campo in cuerpo:
                limpio[campo] = None
            elif creando:
                limpio[campo] = defecto

        if "ram_gb" in cuerpo:
            v = cuerpo["ram_gb"]
            if v is None:
                limpio["ram_gb"] = None
            elif isinstance(v, bool) or not isinstance(v, int):
                err("ram_gb", "int_type", "Input should be a valid integer", entrada=v)
            elif v < 1:
                err("ram_gb", "greater_than_equal", "Input should be greater than or equal to 1", {"ge": 1}, v)
            elif v > 1024:
                err("ram_gb", "less_than_equal", "Input should be less than or equal to 1024", {"le": 1024}, v)
            else:
                limpio["ram_gb"] = v

        for campo in ("fecha_adquisicion", "fecha_ultima_revision"):
            if campo in cuerpo:
                v = cuerpo[campo]
                if v is None:
                    limpio[campo] = None
                    continue
                try:
                    limpio[campo] = date.fromisoformat(v).isoformat()
                except (TypeError, ValueError):
                    err(campo, "date_from_datetime_parsing", "Input should be a valid date", entrada=v)

        if creando:
            for campo in CAMPOS_TEXTO:
                limpio.setdefault(campo, None)
            limpio.setdefault("ram_gb", None)
            limpio.setdefault("fecha_adquisicion", None)
            limpio.setdefault("fecha_ultima_revision", None)
        return errores, limpio

    def _buscar(self, campo, valor):
        return next((e for e in self.equipos.values() if e[campo] == valor), None)

    # -- operaciones ---------------------------------------------------------
    def stats(self):
        res = {"total_equipos": len(self.equipos), "por_estado": {}, "por_tipo": {}, "por_laboratorio": {}}
        for e in self.equipos.values():
            res["por_estado"][e["estado"]] = res["por_estado"].get(e["estado"], 0) + 1
            res["por_tipo"][e["tipo_equipo"]] = res["por_tipo"].get(e["tipo_equipo"], 0) + 1
            res["por_laboratorio"][e["laboratorio"]] = res["por_laboratorio"].get(e["laboratorio"], 0) + 1
        return 200, res

    def listar(self, q):
        errores = []

        def entero(nombre, defecto, minimo, maximo=None):
            if nombre not in q:
                return defecto
            try:
                v = int(q[nombre][0])
            except ValueError:
                errores.append({"type": "int_parsing", "loc": ["query", nombre], "msg": "Input should be a valid integer"})
                return defecto
            if v < minimo:
                errores.append({"type": "greater_than_equal", "loc": ["query", nombre], "msg": "", "ctx": {"ge": minimo}})
            if maximo and v > maximo:
                errores.append({"type": "less_than_equal", "loc": ["query", nombre], "msg": "", "ctx": {"le": maximo}})
            return v

        page = entero("page", 1, 1)
        size = entero("page_size", 20, 1, 100)
        estado = q.get("estado", [None])[0]
        tipo = q.get("tipo_equipo", [None])[0]
        if estado and estado not in ESTADOS:
            errores.append({"type": "enum", "loc": ["query", "estado"], "msg": ""})
        if tipo and tipo not in TIPOS:
            errores.append({"type": "enum", "loc": ["query", "tipo_equipo"], "msg": ""})
        if errores:
            return 422, {"detail": errores}

        lab = (q.get("laboratorio", [""])[0] or "").lower()
        busq = (q.get("busqueda", [""])[0] or "").lower()
        filas = list(self.equipos.values())
        if estado:
            filas = [e for e in filas if e["estado"] == estado]
        if tipo:
            filas = [e for e in filas if e["tipo_equipo"] == tipo]
        if lab:
            filas = [e for e in filas if lab in e["laboratorio"].lower()]
        if busq:
            campos = ("numero_inventario", "marca", "modelo", "numero_serie", "responsable")
            filas = [e for e in filas if any(busq in (e[c] or "").lower() for c in campos)]
        filas.sort(key=lambda e: e["created_at"], reverse=True)
        inicio = (page - 1) * size
        return 200, {"total": len(filas), "page": page, "page_size": size, "equipos": filas[inicio:inicio + size]}

    def obtener(self, eid):
        e = self.equipos.get(eid)
        return (200, e) if e else (404, {"detail": "Equipo no encontrado"})

    def crear(self, cuerpo):
        errores, datos = self._validar(cuerpo, True)
        if errores:
            return 422, {"detail": errores}
        if self._buscar("numero_inventario", datos["numero_inventario"]):
            return 409, {"detail": f"Ya existe un equipo con el número de inventario '{datos['numero_inventario']}'"}
        if self._buscar("numero_serie", datos["numero_serie"]):
            return 409, {"detail": f"Ya existe un equipo con el número de serie '{datos['numero_serie']}'"}
        ahora = datetime.utcnow().isoformat()
        eid = str(uuid.uuid4())
        equipo = {"id": eid, **datos, "created_at": ahora, "updated_at": ahora}
        self.equipos[eid] = equipo
        return 201, equipo

    def actualizar(self, eid, cuerpo):
        errores, datos = self._validar(cuerpo, False)
        if errores:
            return 422, {"detail": errores}
        if datos.get("numero_inventario"):
            otro = self._buscar("numero_inventario", datos["numero_inventario"])
            if otro and otro["id"] != eid:
                return 409, {"detail": f"Ya existe otro equipo con el número de inventario '{datos['numero_inventario']}'"}
        if datos.get("numero_serie"):
            otro = self._buscar("numero_serie", datos["numero_serie"])
            if otro and otro["id"] != eid:
                return 409, {"detail": f"Ya existe otro equipo con el número de serie '{datos['numero_serie']}'"}
        e = self.equipos.get(eid)
        if not e:
            return 404, {"detail": "Equipo no encontrado"}
        for k, v in datos.items():
            if v is not None:  # igual que el backend: los nulos se ignoran
                e[k] = v
        e["updated_at"] = datetime.utcnow().isoformat()
        return 200, e

    def eliminar(self, eid):
        if eid not in self.equipos:
            return 404, {"detail": "Equipo no encontrado"}
        del self.equipos[eid]
        return 204, None


RE_UUID = re.compile(r"^[0-9a-fA-F]{8}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{12}$")


def despachar_simulado(sim, metodo, ruta, consulta, cuerpo_bytes):
    partes = [p for p in ruta.split("/") if p]  # ['api', 'equipos', ...]
    if partes[:2] != ["api", "equipos"] or len(partes) > 3:
        return 404, {"detail": "Not Found"}

    cuerpo = None
    if metodo in ("POST", "PUT"):
        try:
            cuerpo = json.loads(cuerpo_bytes or b"null")
        except ValueError:
            return 422, {"detail": [{"type": "json_invalid", "loc": ["body", 0], "msg": "JSON decode error"}]}

    if len(partes) == 2:
        if metodo == "GET":
            return sim.listar(consulta)
        if metodo == "POST":
            return sim.crear(cuerpo)
        return 405, {"detail": "Method Not Allowed"}

    recurso = partes[2]
    if recurso == "stats":
        return sim.stats() if metodo == "GET" else (405, {"detail": "Method Not Allowed"})
    if not RE_UUID.match(recurso):
        return 422, {"detail": [{"type": "uuid_parsing", "loc": ["path", "equipo_id"], "msg": "Input should be a valid UUID"}]}
    eid = str(uuid.UUID(recurso))
    if metodo == "GET":
        return sim.obtener(eid)
    if metodo == "PUT":
        return sim.actualizar(eid, cuerpo)
    if metodo == "DELETE":
        return sim.eliminar(eid)
    return 405, {"detail": "Method Not Allowed"}


# ---------------------------------------------------------------------------
# Servidor HTTP
# ---------------------------------------------------------------------------

def crear_manejador(backend, simulador):
    class Manejador(BaseHTTPRequestHandler):
        server_version = "ServidorDev/1.0"

        def log_message(self, formato, *args):
            sys.stderr.write("[%s] %s\n" % (self.log_date_time_string(), formato % args))

        def _api(self):
            longitud = int(self.headers.get("Content-Length") or 0)
            cuerpo = self.rfile.read(longitud) if longitud else b""
            partes = urlsplit(self.path)

            if simulador is not None:
                estado, datos = despachar_simulado(
                    simulador, self.command, partes.path, parse_qs(partes.query), cuerpo
                )
                self.send_response(estado)
                if estado == 204:
                    self.send_header("Content-Length", "0")
                    self.end_headers()
                    return
                carga = json.dumps(datos, ensure_ascii=False).encode("utf-8")
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(carga)))
                self.end_headers()
                self.wfile.write(carga)
                return

            destino = backend.rstrip("/") + self.path
            peticion = urllib.request.Request(destino, data=cuerpo or None, method=self.command)
            for cabecera in ("Content-Type", "Accept"):
                if self.headers.get(cabecera):
                    peticion.add_header(cabecera, self.headers[cabecera])
            try:
                respuesta = urllib.request.urlopen(peticion, timeout=30)
                estado, carga, tipo = respuesta.status, respuesta.read(), respuesta.headers.get("Content-Type")
            except urllib.error.HTTPError as e:
                estado, carga, tipo = e.code, e.read(), e.headers.get("Content-Type")
            except (urllib.error.URLError, OSError) as e:
                estado = 502
                carga = json.dumps({"detail": f"No se pudo conectar con el backend ({e})"}).encode("utf-8")
                tipo = "application/json"
            self.send_response(estado)
            if tipo:
                self.send_header("Content-Type", tipo)
            self.send_header("Content-Length", str(len(carga)))
            self.end_headers()
            if carga:
                self.wfile.write(carga)

        def _estatico(self, solo_cabeceras=False):
            ruta = urlsplit(self.path).path
            archivo = Path(os.path.abspath(os.path.join(str(RAIZ), unquote(ruta).lstrip("/"))))
            if RAIZ not in archivo.parents and archivo != RAIZ:
                archivo = RAIZ / "index.html"
            if archivo.is_dir():
                archivo = archivo / "index.html"
            if not archivo.is_file():
                archivo = RAIZ / "index.html"  # respaldo SPA
            contenido = archivo.read_bytes()
            tipo = mimetypes.guess_type(str(archivo))[0] or "application/octet-stream"
            if tipo.startswith("text/") or tipo == "application/javascript":
                tipo += "; charset=utf-8"
            self.send_response(200)
            self.send_header("Content-Type", tipo)
            self.send_header("Content-Length", str(len(contenido)))
            self.send_header("Cache-Control", "no-cache")
            self.end_headers()
            if not solo_cabeceras:
                self.wfile.write(contenido)

        def _es_api(self):
            return urlsplit(self.path).path.startswith("/api/") or urlsplit(self.path).path == "/api"

        def do_GET(self):
            self._api() if self._es_api() else self._estatico()

        def do_HEAD(self):
            self._estatico(solo_cabeceras=True)

        def do_POST(self):
            self._api() if self._es_api() else self.send_error(405)

        def do_PUT(self):
            self._api() if self._es_api() else self.send_error(405)

        def do_DELETE(self):
            self._api() if self._es_api() else self.send_error(405)

    return Manejador


def main():
    parser = argparse.ArgumentParser(description="Servidor de desarrollo de la interfaz de inventario.")
    parser.add_argument("--puerto", type=int, default=5500, help="Puerto local (predeterminado: 5500)")
    parser.add_argument("--backend", default="http://localhost:8000", help="URL del backend FastAPI")
    parser.add_argument("--simulado", action="store_true", help="Usar una API simulada en memoria")
    args = parser.parse_args()

    simulador = Simulador() if args.simulado else None
    servidor = ThreadingHTTPServer(("127.0.0.1", args.puerto), crear_manejador(args.backend, simulador))
    modo = "API simulada en memoria" if simulador else f"proxy hacia {args.backend}"
    print(f"Interfaz disponible en http://localhost:{args.puerto}  ({modo})")
    print("Presiona Ctrl+C para detener.")
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        servidor.server_close()


if __name__ == "__main__":
    main()
