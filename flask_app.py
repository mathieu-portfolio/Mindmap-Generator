import os
from flask import Flask, request, render_template, jsonify, send_from_directory
from mindmap_generator import convert_url_to_mindmap

app = Flask(__name__)

base_dir = os.path.abspath(os.path.dirname(__file__))
json_dir = os.path.join(base_dir, 'json_mmaps')

@app.route('/generate', methods=['POST'])
def generate():
  data = request.json
  url = data['url']
  max_depth = int(data['max_depth'])
  
  mindmap = convert_url_to_mindmap(url, max_depth)
  
  return jsonify(mindmap)

@app.route('/save', methods=['POST'])
def save():
  data = request.get_json()
  modelData = data['modelData']
  filename = data['filename']

  # Save the modelData to your file in 'json_mmaps'
  with open(os.path.join(json_dir, f'{filename}.json'), 'w') as f:
    f.write(modelData)

  return jsonify({'success': True})

@app.route('/delete/<filename>', methods=['POST'])
def delete_file(filename):
  try:
    os.remove(os.path.join(json_dir, f'{filename}.json'))
    return jsonify({'success': True})
  except Exception as e:
    return jsonify({'success': False, 'error': str(e)})

@app.route('/get_mindmap/<filename>', methods=['GET'])
def get_mindmap(filename):
  # Send the contents of the requested JSON file
  return send_from_directory(json_dir, f'{filename}.json')

@app.route('/get_json_files', methods=['GET'])
def get_json_files():
  json_files = [f.split('.')[0] for f in os.listdir(json_dir) if f.endswith('.json')]
  print("JSON Directory: ", json_dir)
  print("Files in JSON Directory: ", json_files)
  return jsonify(json_files)

@app.route('/')
def home():
  return render_template('index.html')

if __name__ == '__main__':
  app.run(port=5000, debug=True)
