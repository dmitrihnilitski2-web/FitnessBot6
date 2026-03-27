import codecs
path = 'c:/Users/HP/Desktop/FBot_V_2.0/static/js/client.js'
with codecs.open(path, 'r', 'utf-8') as f:
    content = f.read()

content = content.replace("el.style.filter = 'grayscale(100%) opacity(0.5)';", "el.style.opacity = '0.4';")
content = content.replace("selectedObj.style.filter = 'drop-shadow(0 0 10px rgba(255,255,255,0.2))';", "selectedObj.style.opacity = '1';")
content = content.replace("selectedObj.style.transform = 'scale(1.1)';", "selectedObj.style.transform = 'scale(1.2)';")

with codecs.open(path, 'w', 'utf-8') as f:
    f.write(content)
print("Replaced successfully")
