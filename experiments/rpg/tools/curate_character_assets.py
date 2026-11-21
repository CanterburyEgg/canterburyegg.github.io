"""Curate the character files the game uses out of the (gitignored) Quaternius packs into
experiments/rpg/assets/characters/, which IS committed. All packs are CC0.

  python3 experiments/rpg/tools/curate_character_assets.py

- Bodies + hair glTFs are copied with their texture references stripped (we repaint everything),
  except the eyeball texture, which the face code recolors.
- Animations: the clips the game plays are pulled out of UAL1 + UAL2 into one slim anims.glb
  (skeleton nodes only, no meshes; scale tracks and per-bone position tracks dropped, as the
  game ignores them anyway).
Re-run after adding a clip to GAME_CLIPS or a hairstyle to HAIR.
"""
import json, os, shutil, struct

HERE = os.path.dirname(os.path.abspath(__file__))
RPG = os.path.dirname(HERE)
SRC = os.path.join(RPG, 'assets', '_extracted')
OUT = os.path.join(RPG, 'assets', 'characters')
UBC = os.path.join(SRC, 'Universal_Base_Characters', 'Universal Base Characters[Standard]')
BODY_DIR = os.path.join(UBC, 'Base Characters', 'Godot - UE')
HAIR_DIR = os.path.join(UBC, 'Hairstyles', 'Rigged to Head Bone', 'glTF (Godot -Unreal)')
UAL = [
    os.path.join(SRC, 'UAL', 'Universal Animation Library[Standard]', 'Unreal-Godot', 'UAL1_Standard.glb'),
    os.path.join(SRC, 'UAL', 'Universal Animation Library 2[Standard]', 'Unreal-Godot', 'UAL2_Standard.glb'),
]
BODIES = ['Superhero_Male_FullBody', 'Superhero_Female_FullBody']
HAIR = ['Hair_Buzzed', 'Hair_BuzzedFemale', 'Hair_SimpleParted', 'Hair_Long', 'Hair_Buns', 'Hair_Beard',
        'Eyebrows_Regular', 'Eyebrows_Female']
GAME_CLIPS = ['Idle_Loop', 'Walk_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop', 'Walk_Formal_Loop', 'TreeChopping_Loop', 'Farm_Harvest', 'Fixing_Kneeling',
              'Idle_Talking_Loop', 'Interact', 'Yes', 'PickUp_Table']
KEEP_TEXTURE_MATERIALS = {'MI_Eyes'}


def strip_gltf(src_dir, name):
    j = json.load(open(os.path.join(src_dir, name + '.gltf')))
    keep_images = []
    for m in j.get('materials', []):
        m.pop('normalTexture', None)
        pbr = m.setdefault('pbrMetallicRoughness', {})
        pbr.pop('metallicRoughnessTexture', None)
        if m.get('name') in KEEP_TEXTURE_MATERIALS and 'baseColorTexture' in pbr:
            keep_images.append((m, j['textures'][pbr['baseColorTexture']['index']]['source']))
        else:
            pbr.pop('baseColorTexture', None)
    images, textures = [], []
    for m, src in keep_images:
        img = dict(j['images'][src])
        images.append(img)
        textures.append({'sampler': 0, 'source': len(images) - 1})
        m['pbrMetallicRoughness']['baseColorTexture'] = {'index': len(textures) - 1}
        shutil.copy(os.path.join(src_dir, img['uri']), os.path.join(OUT, img['uri']))
    for k, v in (('images', images), ('textures', textures)):
        if v: j[k] = v
        else: j.pop(k, None)
    if not textures: j.pop('samplers', None)
    json.dump(j, open(os.path.join(OUT, name + '.gltf'), 'w'), separators=(',', ':'))
    for b in j['buffers']:
        shutil.copy(os.path.join(src_dir, b['uri']), os.path.join(OUT, b['uri']))


def read_glb(path):
    data = open(path, 'rb').read()
    jlen = struct.unpack('<I', data[12:16])[0]
    j = json.loads(data[20:20 + jlen])
    off = 20 + jlen
    blen = struct.unpack('<I', data[off:off + 4])[0]
    return j, data[off + 8:off + 8 + blen]


def slim_anims():
    base, base_bin = read_glb(UAL[0])
    nodes = [{k: v for k, v in n.items() if k not in ('mesh', 'skin')} for n in base['nodes']]
    node_by_name = {n.get('name'): i for i, n in enumerate(nodes)}
    out_views, out_acc, chunks = [], [], []
    offset = 0
    def copy_accessor(j, binbuf, ai, cache):
        nonlocal offset
        if ai in cache: return cache[ai]
        a = dict(j['accessors'][ai])
        bv = j['bufferViews'][a['bufferView']]
        start = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
        comps = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[a['type']]
        size = {5126: 4, 5123: 2, 5125: 4, 5121: 1}[a['componentType']]
        length = a['count'] * comps * size
        if bv.get('byteStride') and bv['byteStride'] != comps * size: raise RuntimeError('strided accessor')
        chunk = binbuf[start:start + length]
        pad = (-len(chunk)) % 4
        chunks.append(chunk + b'\0' * pad)
        out_views.append({'buffer': 0, 'byteOffset': offset, 'byteLength': length})
        offset += length + pad
        a['bufferView'] = len(out_views) - 1
        a.pop('byteOffset', None)
        out_acc.append(a)
        cache[ai] = len(out_acc) - 1
        return cache[ai]
    anims, found = [], set()
    for path in UAL:
        j, binbuf = read_glb(path)
        cache = {}
        for an in j['animations']:
            if an['name'] not in GAME_CLIPS or an['name'] in found: continue
            found.add(an['name'])
            samplers, channels = [], []
            for ch in an['channels']:
                node_name = j['nodes'][ch['target']['node']].get('name')
                prop = ch['target']['path']
                if prop == 'scale': continue
                if prop == 'translation' and node_name not in ('root', 'pelvis'): continue
                if node_name not in node_by_name: continue
                s = an['samplers'][ch['sampler']]
                samplers.append({'input': copy_accessor(j, binbuf, s['input'], cache), 'output': copy_accessor(j, binbuf, s['output'], cache),
                                 'interpolation': s.get('interpolation', 'LINEAR')})
                channels.append({'sampler': len(samplers) - 1, 'target': {'node': node_by_name[node_name], 'path': prop}})
            anims.append({'name': an['name'], 'samplers': samplers, 'channels': channels})
    missing = set(GAME_CLIPS) - found
    if missing: raise RuntimeError(f'missing clips: {missing}')
    binbuf = b''.join(chunks)
    gj = {'asset': {'version': '2.0', 'generator': 'curate_character_assets.py'}, 'scene': 0,
          'scenes': [{'nodes': base['scenes'][base.get('scene', 0)]['nodes']}], 'nodes': nodes,
          'animations': anims, 'accessors': out_acc, 'bufferViews': out_views, 'buffers': [{'byteLength': len(binbuf)}]}
    js = json.dumps(gj, separators=(',', ':')).encode()
    js += b' ' * ((-len(js)) % 4)
    total = 12 + 8 + len(js) + 8 + len(binbuf)
    with open(os.path.join(OUT, 'anims.glb'), 'wb') as f:
        f.write(struct.pack('<4sII', b'glTF', 2, total))
        f.write(struct.pack('<I4s', len(js), b'JSON')); f.write(js)
        f.write(struct.pack('<I4s', len(binbuf), b'BIN\0')); f.write(binbuf)
    return sorted(found)


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    for b in BODIES: strip_gltf(BODY_DIR, b)
    for h in HAIR: strip_gltf(HAIR_DIR, h)
    clips = slim_anims()
    shutil.copy(os.path.join(UBC, 'License_Standard.txt'), os.path.join(OUT, 'LICENSE_UBC_CC0.txt'))
    shutil.copy(os.path.join(SRC, 'UAL', 'Universal Animation Library[Standard]', 'README.txt'), os.path.join(OUT, 'LICENSE_UAL_CC0.txt'))
    total = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT))
    print(f'{len(os.listdir(OUT))} files, {total / 1e6:.1f} MB; clips: {", ".join(clips)}')
