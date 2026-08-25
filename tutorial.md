CTRL + SHIFT + P
Python: Select Interpreter > set to ur conda env
TypeScript: Select TypeScript Version > use Workspace version

cd backend && conda activate myenv && uvicorn main:app --host xxx.xxx.xxx.xxx
ng serve --host xxx.xxx.xxx.xxx

conda update --all --dry-run
conda update --all

pip list --outdated
pip install --upgrade XXX

ng update
ng update XXX

npm outdated
npm update XXX
npm update

conda activate myenv && conda update --all --dry-run && pip list --outdated && ng update && npm outdated

set PYTHONNOUSERSITE=1