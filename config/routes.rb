Rails.application.routes.draw do
  devise_for :users

  namespace :api do
    scope module: :v1, constraints: ApiConstraint.new(version: 'v1') do
      resource :sessions, only: [:destroy] do
        post :facebook
      end
    end
  end
end
