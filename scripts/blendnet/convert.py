"""Convert BlendNet (Apache-2.0) Blender scripts into Kinex one-line parts, safely.

The scripts are downloaded data, so they are never executed. Each one is parsed with
`ast` and evaluated by a small whitelisted interpreter: numbers, math, loops, simple
functions, and calls into a FAKE bpy that only records which primitives were added
where. Anything outside the whitelist (other imports, file access, modifiers,
booleans, mesh editing) makes that row skip.

Usage:  python -I scripts/blendnet/convert.py <BlendNet.jsonl> <out.jsonl> [limit]
Keeps objects with 2 to 60 parts.
"""
import ast
import json
import math
import random
import os
import sys

DEBUG = os.environ.get("KINEX_DEBUG") == "1"

# ---------------------------------------------------------------- fake bpy


class Unsupported(Exception):
    pass


class Vec:
    def __init__(self, v=(0.0, 0.0, 0.0)):
        self.v = [float(x) for x in v]

    def set(self, v):
        if isinstance(v, Vec):
            v = v.v
        v = list(v)
        if len(v) != 3:
            raise Unsupported("vector length")
        self.v = [float(x) for x in v]

    def __getitem__(self, i):
        return self.v[i]

    def __setitem__(self, i, x):
        self.v[i] = float(x)

    def __iter__(self):
        return iter(self.v)

    def __len__(self):
        return 3

    @property
    def x(self):
        return self.v[0]

    @property
    def y(self):
        return self.v[1]

    @property
    def z(self):
        return self.v[2]


class MaterialList(list):
    pass


class Data:
    def __init__(self):
        self.materials = MaterialList()


class Material:
    def __init__(self, name="Material"):
        self.name = name
        self.diffuse_color = (0.72, 0.75, 0.8, 1)
        self.use_nodes = False
        self.node_tree = Dummy()
        self.metallic = 0.0
        self.roughness = 0.5


class Dummy:
    """Absorbs harmless settings (scene, view layer, node trees) without doing anything."""

    def __getattr__(self, name):
        return Dummy()

    def __call__(self, *a, **k):
        return Dummy()

    def __setattr__(self, name, value):
        pass

    def __getitem__(self, k):
        return Dummy()

    def __iter__(self):  # never iterate forever over a placeholder
        return iter(())

    def __len__(self):
        return 0


class SceneView:
    """bpy.context.scene: its objects are the ones placed so far; everything else is ignored."""

    def __init__(self, scene):
        self.__dict__["_scene"] = scene

    @property
    def objects(self):
        return [o for o in self._scene.objects if not o.deleted]

    def __getattr__(self, name):
        return Dummy()

    def __setattr__(self, name, value):
        pass


BASE = {  # unit dimensions (w, depth-y, height-z) in Blender units for each primitive
    "cube": lambda k: (k.get("size", 2.0),) * 3,
    "cylinder": lambda k: (2 * k.get("radius", 1.0), 2 * k.get("radius", 1.0), k.get("depth", 2.0)),
    "cone": lambda k: (2 * max(k.get("radius1", 1.0), k.get("radius2", 0.0)),) * 2 + (k.get("depth", 2.0),),
    "uv_sphere": lambda k: (2 * k.get("radius", 1.0),) * 3,
    "ico_sphere": lambda k: (2 * k.get("radius", 1.0),) * 3,
    "torus": lambda k: (2 * (k.get("major_radius", 1.0) + k.get("minor_radius", 0.25)),) * 2 + (2 * k.get("minor_radius", 0.25),),
    "plane": lambda k: (k.get("size", 2.0), k.get("size", 2.0), 0.02),
    "circle": lambda k: (2 * k.get("radius", 1.0), 2 * k.get("radius", 1.0), 0.02),
}


class Obj:
    def __init__(self, kind, kw):
        self.kind = kind
        self.kw = kw
        self.name = kind
        self.location = Vec(kw.get("location", (0, 0, 0)))
        self.rotation_euler = Vec(kw.get("rotation", (0, 0, 0)))
        sc = kw.get("scale", (1, 1, 1))
        self.scale = Vec(sc)
        self.data = Data()
        self.active_material = None
        self.deleted = False
        self.selected = True

    def __setattr__(self, name, value):
        if name in ("location", "rotation_euler", "scale") and name in self.__dict__:
            self.__dict__[name].set(value)
        elif name == "dimensions":
            base = BASE[self.kind](self.kw)
            self.__dict__["scale"].set([value[i] / base[i] if base[i] else 1 for i in range(3)])
        elif name in ("modifiers",):
            raise Unsupported("modifiers")
        else:
            self.__dict__[name] = value

    @property
    def modifiers(self):
        raise Unsupported("modifiers")

    def select_set(self, v):
        self.selected = bool(v)


class Scene:
    def __init__(self):
        self.objects = []
        self.active = None


class Ops:
    def __init__(self, scene):
        self.mesh = MeshOps(scene)
        self.object = ObjectOps(scene)
        self.transform = Unavailable("transform")
        self.material = Dummy()
        self.wm = Dummy()


class Unavailable:
    def __init__(self, what):
        self.what = what

    def __getattr__(self, name):
        raise Unsupported(self.what)


class MeshOps:
    def __init__(self, scene):
        self.scene = scene

    def __getattr__(self, name):
        if name.startswith("primitive_") and name.endswith("_add"):
            kind = name[len("primitive_"):-len("_add")]
            if kind not in BASE:
                raise Unsupported(kind)

            def add(**kw):
                for o in self.scene.objects:
                    o.selected = False
                o = Obj(kind, kw)
                self.scene.objects.append(o)
                self.scene.active = o

            return add
        raise Unsupported("mesh." + name)


class ObjectOps:
    def __init__(self, scene):
        self.scene = scene

    def select_all(self, action="SELECT"):
        for o in self.scene.objects:
            o.selected = action != "DESELECT"

    def select_by_type(self, type="MESH"):
        for o in self.scene.objects:
            o.selected = True

    def delete(self, **kw):
        for o in self.scene.objects:
            if o.selected:
                o.deleted = True

    def __getattr__(self, name):
        if name in ("shade_smooth", "shade_flat", "join", "origin_set", "mode_set", "transform_apply", "select_pattern"):
            return lambda *a, **k: None
        if name in ("modifier_add", "modifier_apply", "convert"):
            raise Unsupported(name)
        raise Unsupported("object." + name)


class Collection:
    def __init__(self, items):
        self.items = items

    def new(self, name="Material", **kw):
        m = Material(name)
        self.items.append(m)
        return m

    def get(self, name, default=None):
        for m in self.items:
            if getattr(m, "name", None) == name:
                return m
        return default

    def __getitem__(self, k):
        r = self.get(k)
        if r is None:
            raise Unsupported("lookup")
        return r

    def __iter__(self):
        return iter(self.items)

    def remove(self, *a, **k):
        pass


class BpyData:
    def __init__(self, scene):
        self.materials = Collection([])
        self.objects = ObjectsColl(scene)
        self.meshes = Collection([])


class ObjectsColl:
    def __init__(self, scene):
        self.scene = scene

    def get(self, name, default=None):
        for o in self.scene.objects:
            if o.name == name and not o.deleted:
                return o
        return default

    def __getitem__(self, k):
        o = self.get(k)
        if o is None:
            raise Unsupported("object lookup")
        return o

    def __iter__(self):
        return iter([o for o in self.scene.objects if not o.deleted])

    def remove(self, o, **k):
        o.deleted = True


class Context:
    def __init__(self, scene):
        self.scene_ = scene
        self.scene = SceneView(scene)
        self.view_layer = Dummy()
        self.collection = Dummy()

    @property
    def object(self):
        return self.scene_.active

    @property
    def active_object(self):
        return self.scene_.active

    @property
    def selected_objects(self):
        return [o for o in self.scene_.objects if o.selected and not o.deleted]


class Bpy:
    def __init__(self):
        self.scene = Scene()
        self.ops = Ops(self.scene)
        self.data = BpyData(self.scene)
        self.context = Context(self.scene)


# ---------------------------------------------------------------- safe evaluator


class Return(Exception):
    def __init__(self, v):
        self.v = v


class Break(Exception):
    pass


class Continue(Exception):
    pass


def safe_range(*a):
    r = range(*[int(x) for x in a])
    if len(r) > 5000:
        raise Unsupported("range too big")
    return r


def safe_pow(a, b):
    if abs(b) > 64 or abs(a) > 1e6:
        raise Unsupported("pow too big")
    return a ** b


def safe_mult(a, b):
    if isinstance(a, (str, list, tuple)) or isinstance(b, (str, list, tuple)):
        n = b if isinstance(a, (str, list, tuple)) else a
        if not isinstance(n, int) or n > 1000:
            raise Unsupported("repeat too big")
    return a * b


SAFE_CALLS = {
    "range": safe_range, "len": len, "abs": abs, "min": min, "max": max, "int": int, "float": float, "round": round,
    "enumerate": enumerate, "zip": zip, "list": list, "tuple": tuple, "str": str, "sum": sum, "bool": bool,
    "print": lambda *a, **k: None, "reversed": reversed, "sorted": sorted, "dict": dict, "isinstance": lambda *a: False,
}
SAFE_STR_METHODS = {"format", "upper", "lower", "title", "replace", "strip", "join", "split", "capitalize"}
SAFE_LIST_METHODS = {"append", "extend", "insert", "index", "count", "pop"}
OPS = {
    ast.Add: lambda a, b: a + b, ast.Sub: lambda a, b: a - b, ast.Mult: safe_mult, ast.Div: lambda a, b: a / b,
    ast.FloorDiv: lambda a, b: a // b, ast.Mod: lambda a, b: a % b, ast.Pow: safe_pow,
}
CMP = {
    ast.Eq: lambda a, b: a == b, ast.NotEq: lambda a, b: a != b, ast.Lt: lambda a, b: a < b, ast.LtE: lambda a, b: a <= b,
    ast.Gt: lambda a, b: a > b, ast.GtE: lambda a, b: a >= b, ast.In: lambda a, b: a in b, ast.NotIn: lambda a, b: a not in b,
    ast.Is: lambda a, b: a is b, ast.IsNot: lambda a, b: a is not b,
}
FAKE_TYPES = (SceneView, Bpy, Ops, MeshOps, ObjectOps, Obj, Vec, Data, MaterialList, Material, Dummy, Collection, BpyData, ObjectsColl, Context, Scene)


class Func:
    def __init__(self, node, interp):
        self.node = node
        self.interp = interp

    def __call__(self, *args, **kw):
        a = self.node.args
        local = dict(self.interp.globals)
        defaults = [self.interp.ev(d, local) for d in a.defaults]
        names = [x.arg for x in a.args]
        for i, n in enumerate(names):
            if i < len(args):
                local[n] = args[i]
            elif n in kw:
                local[n] = kw[n]
            elif i >= len(names) - len(defaults):
                local[n] = defaults[i - (len(names) - len(defaults))]
            else:
                raise Unsupported("missing arg")
        try:
            self.interp.block(self.node.body, local)
        except Return as r:
            return r.v
        return None


class Interp:
    def __init__(self, bpy):
        self.steps = 0
        self.globals = {"bpy": bpy, "math": math, "random": random.Random(7), "pi": math.pi}

    def tick(self):
        self.steps += 1
        if self.steps > 300000:
            raise Unsupported("too long")

    def block(self, body, env):
        for s in body:
            self.stmt(s, env)

    def stmt(self, s, env):
        self.tick()
        t = type(s)
        if t is ast.Expr:
            self.ev(s.value, env)
        elif t is ast.Assign:
            v = self.ev(s.value, env)
            for target in s.targets:
                self.assign(target, v, env)
        elif t is ast.AugAssign:
            cur = self.ev(s.target, env) if not isinstance(s.target, ast.Name) else env[s.target.id]
            self.assign(s.target, OPS[type(s.op)](cur, self.ev(s.value, env)), env)
        elif t is ast.AnnAssign and s.value is not None:
            self.assign(s.target, self.ev(s.value, env), env)
        elif t is ast.For:
            for item in self.ev(s.iter, env):
                self.tick()
                self.assign(s.target, item, env)
                try:
                    self.block(s.body, env)
                except Break:
                    break
                except Continue:
                    continue
        elif t is ast.While:
            n = 0
            while self.ev(s.test, env):
                n += 1
                if n > 1000:
                    raise Unsupported("while")
                try:
                    self.block(s.body, env)
                except Break:
                    break
                except Continue:
                    continue
        elif t is ast.If:
            self.block(s.body if self.ev(s.test, env) else s.orelse, env)
        elif t is ast.FunctionDef:
            env[s.name] = Func(s, self)
            self.globals[s.name] = env[s.name]
        elif t is ast.Return:
            raise Return(self.ev(s.value, env) if s.value else None)
        elif t in (ast.Pass,):
            pass
        elif t is ast.Break:
            raise Break()
        elif t is ast.Continue:
            raise Continue()
        elif t is ast.Import:
            for a in s.names:
                if a.name not in ("bpy", "math", "random"):
                    raise Unsupported("import " + a.name)
        elif t is ast.ImportFrom:
            if s.module == "math":
                for a in s.names:
                    env[a.asname or a.name] = getattr(math, a.name)
            else:
                raise Unsupported("from import")
        else:
            raise Unsupported(t.__name__)

    def assign(self, target, v, env):
        t = type(target)
        if t is ast.Name:
            env[target.id] = v
            if env is not self.globals and target.id in self.globals and isinstance(self.globals[target.id], (int, float)):
                pass
        elif t in (ast.Tuple, ast.List):
            vals = list(v)
            if len(vals) != len(target.elts):
                raise Unsupported("unpack")
            for el, x in zip(target.elts, vals):
                self.assign(el, x, env)
        elif t is ast.Attribute:
            if target.attr.startswith("_"):
                raise Unsupported("private attr")
            obj = self.ev(target.value, env)
            if not isinstance(obj, FAKE_TYPES):
                raise Unsupported("attr set")
            setattr(obj, target.attr, v)
        elif t is ast.Subscript:
            obj = self.ev(target.value, env)
            if not isinstance(obj, (list, dict, Vec)):
                raise Unsupported("subscript set")
            obj[self.ev(target.slice, env)] = v
        else:
            raise Unsupported("target")

    def ev(self, e, env):
        self.tick()
        t = type(e)
        if t is ast.Constant:
            return e.value
        if t is ast.Name:
            if e.id in env:
                return env[e.id]
            if e.id in self.globals:
                return self.globals[e.id]
            if e.id in SAFE_CALLS:
                return SAFE_CALLS[e.id]
            if e.id in ("True", "False", "None"):
                return {"True": True, "False": False, "None": None}[e.id]
            raise Unsupported("name " + e.id)
        if t is ast.BinOp:
            return OPS[type(e.op)](self.ev(e.left, env), self.ev(e.right, env))
        if t is ast.UnaryOp:
            v = self.ev(e.operand, env)
            return -v if isinstance(e.op, ast.USub) else (+v if isinstance(e.op, ast.UAdd) else (not v))
        if t is ast.BoolOp:
            vals = None
            for x in e.values:
                vals = self.ev(x, env)
                if isinstance(e.op, ast.And) and not vals:
                    return vals
                if isinstance(e.op, ast.Or) and vals:
                    return vals
            return vals
        if t is ast.Compare:
            left = self.ev(e.left, env)
            for op, c in zip(e.ops, e.comparators):
                right = self.ev(c, env)
                if not CMP[type(op)](left, right):
                    return False
                left = right
            return True
        if t is ast.IfExp:
            return self.ev(e.body, env) if self.ev(e.test, env) else self.ev(e.orelse, env)
        if t in (ast.Tuple, ast.List):
            vals = [self.ev(x, env) for x in e.elts]
            return tuple(vals) if t is ast.Tuple else vals
        if t is ast.Dict:
            return {self.ev(k, env): self.ev(v, env) for k, v in zip(e.keys, e.values)}
        if t is ast.Subscript:
            obj = self.ev(e.value, env)
            return obj[self.ev(e.slice, env)]
        if t is ast.Slice:
            return slice(*(self.ev(x, env) if x else None for x in (e.lower, e.upper, e.step)))
        if t is ast.JoinedStr:
            return "".join(str(self.ev(v, env)) for v in e.values)
        if t is ast.FormattedValue:
            return self.ev(e.value, env)
        if t is ast.ListComp and len(e.generators) == 1 and not e.generators[0].ifs:
            g = e.generators[0]
            out = []
            local = dict(env)
            for item in self.ev(g.iter, local):
                self.assign(g.target, item, local)
                out.append(self.ev(e.elt, local))
            return out
        if t is ast.Attribute:
            if e.attr.startswith("_"):
                raise Unsupported("private attr")  # no __class__/__dict__/__globals__ escapes
            obj = self.ev(e.value, env)
            if obj is math and e.attr in ("factorial", "comb", "perm", "prod", "pow"):
                raise Unsupported("math." + e.attr)
            if obj is math or isinstance(obj, FAKE_TYPES) or isinstance(obj, random.Random):
                return getattr(obj, e.attr)
            if isinstance(obj, str) and e.attr in SAFE_STR_METHODS:
                return getattr(obj, e.attr)
            if isinstance(obj, list) and e.attr in SAFE_LIST_METHODS:
                return getattr(obj, e.attr)
            raise Unsupported("attr " + e.attr)
        if t is ast.Call:
            fn = self.ev(e.func, env)
            args = [self.ev(a, env) for a in e.args]
            kw = {k.arg: self.ev(k.value, env) for k in e.keywords if k.arg}
            if isinstance(fn, Func) or fn in SAFE_CALLS.values() or callable(fn) and (getattr(fn, "__self__", None) is math or getattr(fn, "__module__", None) == "math" or isinstance(getattr(fn, "__self__", None), FAKE_TYPES + (random.Random, str, list))):
                return fn(*args, **kw)
            if callable(fn) and getattr(fn, "__qualname__", "").split(".")[0] in ("MeshOps", "ObjectOps", "Collection", "ObjectsColl", "Obj", "Dummy"):
                return fn(*args, **kw)
            if callable(fn) and getattr(fn, "__name__", "") in ("add", "<lambda>"):
                return fn(*args, **kw)
            raise Unsupported("call")
        raise Unsupported(t.__name__)


# ---------------------------------------------------------------- Blender -> Kinex


def mat_xyz(rx, ry, rz):
    """Blender Euler XYZ: R = Rz @ Ry @ Rx."""
    cx, sx, cy, sy, cz, sz = math.cos(rx), math.sin(rx), math.cos(ry), math.sin(ry), math.cos(rz), math.sin(rz)
    Rx = [[1, 0, 0], [0, cx, -sx], [0, sx, cx]]
    Ry = [[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]]
    Rz = [[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]]
    return mul(Rz, mul(Ry, Rx))


def mul(A, B):
    return [[sum(A[i][k] * B[k][j] for k in range(3)) for j in range(3)] for i in range(3)]


C = [[1, 0, 0], [0, 0, 1], [0, -1, 0]]  # Blender (x, y, z) -> Kinex (x, z, -y)
CT = [[1, 0, 0], [0, 0, -1], [0, 1, 0]]


def three_euler_xyz(m):
    """three.js Euler('XYZ').setFromRotationMatrix."""
    m13 = max(-1.0, min(1.0, m[0][2]))
    y = math.asin(m13)
    if abs(m13) < 0.9999999:
        x = math.atan2(-m[1][2], m[2][2])
        z = math.atan2(-m[0][1], m[0][0])
    else:
        x = math.atan2(m[2][1], m[1][1])
        z = 0.0
    return x, y, z


def hexcolor(c):
    r, g, b = [max(0, min(255, round(float(v) * 255))) for v in list(c)[:3]]
    return "#%02X%02X%02X" % (r, g, b)


def material_kind(mat):
    name = (getattr(mat, "name", "") or "").lower()
    alpha = list(getattr(mat, "diffuse_color", (0, 0, 0, 1)))[3] if len(list(getattr(mat, "diffuse_color", ()))) > 3 else 1
    if alpha < 0.9 or "glass" in name or "lens" in name or "screen" in name and False:
        return "glass"
    if any(k in name for k in ("metal", "steel", "silver", "chrome", "iron", "gold", "brass", "aluminum", "aluminium", "copper")):
        return "metal"
    if any(k in name for k in ("wood", "oak", "pine", "walnut", "bark")):
        return "wood"
    if any(k in name for k in ("light", "glow", "bulb", "led", "lamp", "flame")):
        return "glow"
    if any(k in name for k in ("fabric", "cloth", "cushion", "rubber", "leather", "foam", "paper", "soil", "stone", "concrete")):
        return "matte"
    return "plastic"


def r2(v):
    v = round(v, 2)
    return 0.0 if v == 0 else v


def to_lines(objs):
    lines = []
    for o in objs:
        if o.deleted:
            continue
        base = BASE[o.kind](o.kw)
        sx, sy, sz = (abs(base[i] * o.scale[i]) for i in range(3))
        # size in Kinex terms: w = x, h = blender z, d = blender y
        size = [sx, sz, sy]
        if min(size) <= 0 or max(size) > 200:
            continue
        loc = o.location.v
        pos = [loc[0], loc[2], -loc[1]]
        R = mul(C, mul(mat_xyz(*o.rotation_euler.v), CT))
        if o.kind == "torus":
            # Kinex torus stands in XY; Blender's lies flat in its XY plane (= Kinex XZ).
            R = mul(R, [[1, 0, 0], [0, 0, -1], [0, 1, 0]])
            size = [sx, sy, sz]
        rx, ry, rz = (math.degrees(a) for a in three_euler_xyz(R))
        kind = {"cube": "box", "plane": "box", "circle": "cylinder", "uv_sphere": "sphere", "ico_sphere": "sphere", "cylinder": "cylinder", "torus": "torus"}.get(o.kind)
        if o.kind == "cone":
            r1, r2_, verts = o.kw.get("radius1", 1.0), o.kw.get("radius2", 0.0), o.kw.get("vertices", 32)
            kind = "cylinder" if r2_ > 0.6 * r1 else ("pyramid" if verts == 4 else "cone")
            if r1 < r2_:  # wide end up: flip it
                R = mul(R, [[1, 0, 0], [0, -1, 0], [0, 0, -1]])
                rx, ry, rz = (math.degrees(a) for a in three_euler_xyz(R))
        if o.kind == "ico_sphere" and o.kw.get("subdivisions", 2) <= 1:
            kind = "icosahedron"
        mats = list(o.data.materials) or ([o.active_material] if o.active_material else [])
        mat = mats[0] if mats else None
        color = hexcolor(mat.diffuse_color) if mat else "#B8BFCC"
        lines.append(" ".join(str(x) for x in [kind, *map(r2, size), *map(r2, pos), *(round(a) for a in (rx, ry, rz)), color, material_kind(mat) if mat else "plastic"]))
    return lines


def convert(script):
    bpy = Bpy()
    it = Interp(bpy)
    tree = ast.parse(script)
    it.block(tree.body, it.globals)
    return to_lines(bpy.scene.objects)


def main():
    src, out = sys.argv[1], sys.argv[2]
    limit = int(sys.argv[3]) if len(sys.argv) > 3 else None
    ok = skipped = 0
    reasons = {}
    with open(src, encoding="utf8") as f, open(out, "w", encoding="utf8") as w:
        for i, line in enumerate(f):
            if limit and i >= limit:
                break
            if DEBUG:
                print("start row %d" % i, file=sys.stderr, flush=True)
            if i and i % 500 == 0:
                print("row %d: %d converted" % (i, ok), file=sys.stderr, flush=True)
            row = json.loads(line)
            try:
                lines = convert(row["script"])
                if not 2 <= len(lines) <= 60:
                    raise Unsupported("part count %d" % len(lines))
                w.write(json.dumps({"id": "bn-%s" % row["id"], "name": row.get("name"), "text": row["instruction"], "category": row.get("category"), "verify": row.get("verify"), "lines": lines}) + "\n")
                ok += 1
            except (Unsupported, SyntaxError, ZeroDivisionError, ValueError, TypeError, KeyError, IndexError, AttributeError, RecursionError, OverflowError) as err:
                skipped += 1
                key = type(err).__name__ + (": " + str(err).split(" ")[0] if isinstance(err, Unsupported) else "")
                reasons[key] = reasons.get(key, 0) + 1
    print(json.dumps({"converted": ok, "skipped": skipped, "top_reasons": sorted(reasons.items(), key=lambda x: -x[1])[:12]}))


if __name__ == "__main__":
    main()
