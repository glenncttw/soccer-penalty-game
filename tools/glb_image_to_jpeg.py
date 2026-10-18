"""Replace one image in a .glb with a JPEG (4:4:4, so normal maps keep their detail), repacking the binary chunk.

Usage: python3 tools/glb_image_to_jpeg.py in.glb <image name> <quality> out.glb   (needs Pillow)
Run it before meshopt compression: it doesn't understand compressed buffers.
"""
import io, json, struct, sys
from PIL import Image
src, name, quality, dst = sys.argv[1], sys.argv[2], int(sys.argv[3]), sys.argv[4]
d = open(src, 'rb').read()
jl = struct.unpack('<I', d[12:16])[0]
j = json.loads(d[20:20 + jl])
bin_start = 20 + jl + 8
blob = d[bin_start:bin_start + struct.unpack('<I', d[20 + jl:24 + jl])[0]]
img = next(i for i in j['images'] if i.get('name') == name)
old = j['bufferViews'][img['bufferView']]
data = blob[old.get('byteOffset', 0):old.get('byteOffset', 0) + old['byteLength']]
buf = io.BytesIO()
Image.open(io.BytesIO(data)).convert('RGB').save(buf, 'JPEG', quality=quality, subsampling=0)
new_img = buf.getvalue()
out = bytearray()
for k, bv in enumerate(j['bufferViews']):
    if bv.get('buffer', 0) != 0:
        continue
    piece = new_img if k == img['bufferView'] else blob[bv.get('byteOffset', 0):bv.get('byteOffset', 0) + bv['byteLength']]
    while len(out) % 4:
        out.append(0)
    bv['byteOffset'] = len(out)
    bv['byteLength'] = len(piece)
    out += piece
while len(out) % 4:
    out.append(0)
img['mimeType'] = 'image/jpeg'
j['buffers'][0]['byteLength'] = len(out)
js = json.dumps(j, separators=(',', ':')).encode()
js += b' ' * (-len(js) % 4)
total = 12 + 8 + len(js) + 8 + len(out)
with open(dst, 'wb') as f:
    f.write(struct.pack('<III', 0x46546C67, 2, total))
    f.write(struct.pack('<II', len(js), 0x4E4F534A)); f.write(js)
    f.write(struct.pack('<II', len(out), 0x004E4942)); f.write(out)
print(name, len(data), '->', len(new_img), 'bytes; file', total)
