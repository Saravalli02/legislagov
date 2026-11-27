"""Uma vez: tira a troca obrigatória de senha dos administradores (e do usuário de teste "user") em todas as Câmaras.
Pedido do Ricardo em 27/11/2026: Ricardo, Geraldo e o usuário de teste não devem ver "Crie a sua senha" ao entrar."""
import json, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
import lgapi
n = 0
for cam in lgapi.camaras_ids():
    c = lgapi._cam(cam)
    for r in c.execute("SELECT id, usuario, dados FROM usuarios WHERE camara=?", (cam,)).fetchall():
        d = json.loads(r["dados"])
        if d.get("trocarSenha") and (d.get("perfil") == "admin" or str(r["usuario"]).lower() == "user"):
            d.pop("trocarSenha", None)
            c.execute("UPDATE usuarios SET dados=? WHERE id=?", (json.dumps(d, ensure_ascii=False), r["id"]))
            print(cam, r["usuario"]); n += 1
print("ajustados:", n)
