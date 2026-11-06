from fastapi import FastAPI

app = FastAPI()

@app.post('/test')
async def test(data: dict):
    return {"received": data}

if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host='0.0.0.0', port=8889)
